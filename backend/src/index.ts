import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { Request } from 'express';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import { allowLocalFallback, getLastConnectionError, getPool, shouldSkipDatabaseAttempt, sql } from './db';
import { extractTextPagesFromPdfBuffer } from './pdf-pages';
import {
  createLocalUser,
  createLocalPoem,
  createLocalPayment,
  deleteLocalPoem,
  getLocalPoemById,
  getLocalPaymentDisplay,
  getLocalPoemByTitle,
  getLocalUserByEmail,
  listLocalPayments,
  listLocalPoems,
  readLocalPoemPages,
  readLocalPoemPagesAdmin,
  updateLocalPaymentDisplay,
  updateLocalPaymentStatus,
  updateLocalPoem,
} from './store';

const app = express();
const PORT = Number(process.env.PORT || 5005);
const DB_OPERATION_TIMEOUT_MS = Number(process.env.DB_OPERATION_TIMEOUT_MS || 5000);
const JWT_SECRET = process.env.JWT_SECRET || 'poetry-hub-admin-secret';
const DEFAULT_ADMIN_LOGIN_ID = process.env.ADMIN_LOGIN_ID || 'sunheriyaadonkemoti@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Godblessme@1356';
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const uploadFolders = {
  coverImage: path.join(uploadsRoot, 'covers'),
  backgroundMusic: path.join(uploadsRoot, 'audio'),
  paymentScreenshot: path.join(uploadsRoot, 'payments'),
  paymentQr: path.join(uploadsRoot, 'qr'),
  poemPdf: path.join(uploadsRoot, 'pdfs'),
} as const;

type UploadedFiles = {
  coverImage?: Express.Multer.File[];
  backgroundMusic?: Express.Multer.File[];
  poemPdf?: Express.Multer.File[];
};

type AuthenticatedRequest = Request & {
  admin?: {
    loginId: string;
    role: string;
  };
  user?: {
    id: number;
    email: string;
    role: string;
  };
};

for (const folderPath of Object.values(uploadFolders)) {
  fs.mkdirSync(folderPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folderPath =
      uploadFolders[file.fieldname as keyof typeof uploadFolders] ?? uploadFolders.coverImage;
    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    const safeName = path
      .basename(file.originalname, extension)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);

    cb(null, `${Date.now()}-${safeName || 'file'}${extension.toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 400 * 1024 * 1024 }, // Allowed 400 MB for PDF and MP3 uploads
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsRoot));

const toPublicUrl = (req: Request, filePath?: string | null) => {
  if (!filePath) {
    return null;
  }

  if (/^https?:\/\//i.test(filePath)) {
    return filePath;
  }

  if (!filePath.startsWith('/')) {
    return filePath;
  }

  return `${req.protocol}://${req.get('host')}${filePath}`;
};

const serializePoem = (req: Request, poem: Record<string, unknown>) => ({
  ...poem,
  cover_image_url: toPublicUrl(req, poem.cover_image_url as string | null | undefined),
  music_file_url: toPublicUrl(req, poem.music_file_url as string | null | undefined),
  pdf_file_url: toPublicUrl(req, poem.pdf_file_url as string | null | undefined),
});

let schemaInitializationPromise: Promise<void> | null = null;

const ensureSchema = async () => {
  if (!schemaInitializationPromise) {
    schemaInitializationPromise = (async () => {
      const pool = await getPool();
      const initSql = fs.readFileSync(path.resolve(__dirname, 'init.sql'), 'utf8');
      await pool.request().batch(initSql);
    })().catch((error: unknown) => {
      schemaInitializationPromise = null;
      throw error;
    });
  }

  await schemaInitializationPromise;
};

const getDatabasePool = async () => {
  await ensureSchema();
  return getPool();
};

const withStorageFallback = async <T>(
  databaseAction: () => Promise<T>,
  fallbackAction: () => Promise<T>,
  operation: string,
) => {
  if (shouldSkipDatabaseAttempt()) {
    console.warn(`Skipping database ${operation} because a recent SQL Server connection attempt failed.`);
    return fallbackAction();
  }

  try {
    const databaseResult = allowLocalFallback
      ? await Promise.race<T>([
          databaseAction(),
          new Promise<T>((_, reject) => {
            setTimeout(() => reject(new Error(`Database ${operation} timed out after ${DB_OPERATION_TIMEOUT_MS}ms`)), DB_OPERATION_TIMEOUT_MS);
          }),
        ])
      : await databaseAction();

    return databaseResult;
  } catch (error) {
    if (!allowLocalFallback) {
      throw error;
    }

    console.error(`Database ${operation} failed. Falling back to local storage.`, error ?? getLastConnectionError());
    return fallbackAction();
  }
};

const parsePoemId = (id: string) => {
  const poemId = Number(id);

  if (!Number.isInteger(poemId) || poemId < 1) {
    return null;
  }

  return poemId;
};

const signAdminToken = (loginId: string) =>
  jwt.sign(
    {
      loginId,
      role: 'admin',
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

const signUserToken = (user: { id: number; email: string; role: string }) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );

const requireAdminAuth = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Admin login required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { loginId?: string; role?: string };

    if (payload.role !== 'admin' || !payload.loginId) {
      return res.status(403).json({ error: 'Invalid admin token' });
    }

    req.admin = {
      loginId: payload.loginId,
      role: payload.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
};

const requireUserAuth = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'User login required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: number; email?: string; role?: string };

    if (!payload.userId || !payload.email || payload.role !== 'user') {
      return res.status(403).json({ error: 'Invalid user token' });
    }

    req.user = {
      id: Number(payload.userId),
      email: String(payload.email),
      role: payload.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
};

const parsePoemPages = (poemContent: string) =>
  poemContent
    .split(/\r?\n\s*---PAGE---\s*\r?\n/g)
    .map((page) => page.trim())
    .filter(Boolean);

const allowedPaymentStatuses = new Set(['pending', 'verified', 'rejected']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const buildUserNameFromEmail = (email: string) => {
  const localPart = normalizeEmail(email).split('@')[0] || 'Reader';

  return (
    localPart
      .split(/[._-]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Reader'
  );
};

const savePoemPages = async (transaction: InstanceType<typeof sql.Transaction>, poemId: number, poemContent: string) => {
  const pages = parsePoemPages(poemContent);

  if (pages.length === 0) {
    throw new Error('Poem text is required');
  }

  await transaction.request().input('poemId', sql.Int, poemId).query('DELETE FROM poem_pages WHERE poem_id = @poemId');

  for (const [index, page] of pages.entries()) {
    await transaction
      .request()
      .input('poemId', sql.Int, poemId)
      .input('pageNumber', sql.Int, index + 1)
      .input('contentText', sql.NVarChar(sql.MAX), page).query(`
        INSERT INTO poem_pages (poem_id, page_number, content_text)
        VALUES (@poemId, @pageNumber, @contentText)
      `);
  }
};

app.post('/api/test-names', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (name.length > 255) {
      return res.status(400).json({ error: 'Name must be 255 characters or fewer' });
    }

    const pool = await getDatabasePool();
    const result = await pool
      .request()
      .input('name', sql.NVarChar(255), name)
      .query(`
        INSERT INTO api_names (name)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.created_at
        VALUES (@name)
      `);

    return res.status(201).json({
      message: 'Name stored successfully',
      entry: result.recordset[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to store name in database',
    });
  }
});

app.get('/api/test-names', async (req, res) => {
  try {
    const pool = await getDatabasePool();
    const result = await pool.request().query(`
      SELECT id, name, created_at
      FROM api_names
      ORDER BY created_at DESC, id DESC
    `);

    return res.json(result.recordset);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch names from database',
    });
  }
});

app.get('/api/payment-display', async (req, res) => {
  try {
    const payload = await withStorageFallback<{ qr_image_url: string | null; upi_id: string | null }>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .query('SELECT payment_qr_image_url, payment_upi_id FROM site_settings WHERE id = 1');

        const row = result.recordset[0] as { payment_qr_image_url: string | null; payment_upi_id: string | null } | undefined;

        if (!row) {
          return { qr_image_url: null, upi_id: null };
        }

        return {
          qr_image_url: toPublicUrl(req, row.payment_qr_image_url),
          upi_id: row.payment_upi_id ?? null,
        };
      },
      async () => {
        const local = await getLocalPaymentDisplay();
        return {
          qr_image_url: toPublicUrl(req, local.qr_image_url),
          upi_id: local.upi_id,
        };
      },
      'payment display',
    );

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load payment display settings' });
  }
});

app.patch('/api/admin/payment-display', requireAdminAuth, upload.single('paymentQr'), async (req, res) => {
  try {
    const upiIdRaw = req.body?.upiId as string | undefined;

    const updated = await withStorageFallback<{ qr_image_url: string | null; upi_id: string | null }>(
      async () => {
        const pool = await getDatabasePool();
        const cur = await pool
          .request()
          .query('SELECT payment_qr_image_url, payment_upi_id FROM site_settings WHERE id = 1');

        let qr = (cur.recordset[0] as { payment_qr_image_url: string | null } | undefined)?.payment_qr_image_url ?? null;
        let upi = (cur.recordset[0] as { payment_upi_id: string | null } | undefined)?.payment_upi_id ?? null;

        if (req.file) {
          qr = `/uploads/qr/${req.file.filename}`;
        }

        if (upiIdRaw !== undefined) {
          upi = String(upiIdRaw).trim() || null;
        }

        await pool
          .request()
          .input('qr', sql.NVarChar(sql.MAX), qr)
          .input('upi', sql.NVarChar(255), upi)
          .query(`
            UPDATE site_settings
            SET payment_qr_image_url = @qr, payment_upi_id = @upi, updated_at = SYSUTCDATETIME()
            WHERE id = 1
          `);

        return {
          qr_image_url: toPublicUrl(req, qr),
          upi_id: upi,
        };
      },
      async () => {
        const patch: { qr_image_url?: string | null; upi_id?: string | null } = {};

        if (req.file) {
          patch.qr_image_url = `/uploads/qr/${req.file.filename}`;
        }

        if (upiIdRaw !== undefined) {
          patch.upi_id = String(upiIdRaw).trim() || null;
        }

        const saved = await updateLocalPaymentDisplay(patch);
        return {
          qr_image_url: toPublicUrl(req, saved.qr_image_url),
          upi_id: saved.upi_id,
        };
      },
      'payment display update',
    );

    res.json({
      message: 'Payment display updated',
      payment_display: updated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update payment display' });
  }
});

app.get('/api/poems', async (req, res) => {
  try {
    const poems = await withStorageFallback<Record<string, unknown>[]>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool.request().query('SELECT * FROM poems ORDER BY created_at DESC, id DESC');
        return result.recordset as Record<string, unknown>[];
      },
      async () => (await listLocalPoems()) as Record<string, unknown>[],
      'poem listing',
    );

    res.json(poems.map((poem: Record<string, unknown>) => serializePoem(req, poem)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch poems' });
  }
});

app.get('/api/poems/by-title', async (req, res) => {
  try {
    const title = String(req.query.title || '').trim();

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const poem = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('title', sql.NVarChar(255), title)
          .query('SELECT TOP 1 * FROM poems WHERE title = @title ORDER BY id DESC');

        return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
      },
      async () => (await getLocalPoemByTitle(title)) as Record<string, unknown> | null,
      'poem lookup by title',
    );

    if (!poem) {
      return res.status(404).json({ error: 'Poem not found' });
    }

    res.json(serializePoem(req, poem as Record<string, unknown>));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch poem' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const loginId = String(req.body.loginId || '').trim();
    const password = String(req.body.password || '');

    if (!loginId || !password) {
      return res.status(400).json({ error: 'ID and password are required' });
    }

    const adminUser = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('loginId', sql.NVarChar(255), loginId)
          .query(`
            SELECT TOP 1 id, name, email, password_hash, role
            FROM users
            WHERE role = 'admin'
              AND (name = @loginId OR email = @loginId)
            ORDER BY id DESC
          `);

        return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
      },
      async () => {
        if (loginId !== DEFAULT_ADMIN_LOGIN_ID) {
          return null;
        }

        return {
          id: 0,
          name: 'Sunheri Yaadon Ke Moti Admin',
          email: DEFAULT_ADMIN_LOGIN_ID,
          password_hash: bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10),
          role: 'admin',
        } as Record<string, unknown>;
      },
      'admin login lookup',
    );

    if (!adminUser) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      String(adminUser.password_hash || ''),
    );

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    const resolvedLoginId = String(adminUser.name || adminUser.email || loginId);
    const token = signAdminToken(resolvedLoginId);

    res.json({
      message: 'Admin login successful',
      token,
      admin: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/api/users/register', async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''));
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!emailPattern.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('email', sql.NVarChar(255), email)
          .query(`
            SELECT TOP 1 id, name, email, password_hash, role, created_at
            FROM users
            WHERE email = @email
          `);

        return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
      },
      async () => (await getLocalUserByEmail(email)) as Record<string, unknown> | null,
      'user lookup by email',
    );

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userName = buildUserNameFromEmail(email);

    const createdUser = await withStorageFallback<Record<string, unknown>>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('name', sql.NVarChar(255), userName)
          .input('email', sql.NVarChar(255), email)
          .input('passwordHash', sql.NVarChar(sql.MAX), passwordHash)
          .input('role', sql.NVarChar(50), 'user').query(`
            INSERT INTO users (name, email, password_hash, role)
            OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.role, INSERTED.created_at
            VALUES (@name, @email, @passwordHash, @role)
          `);

        return result.recordset[0] as Record<string, unknown>;
      },
      async () =>
        (await createLocalUser({
          name: userName,
          email,
          passwordHash,
          role: 'user',
        })) as Record<string, unknown>,
      'user registration',
    );

    const authUser = {
      id: Number(createdUser.id),
      name: String(createdUser.name || userName),
      email: String(createdUser.email || email),
      role: String(createdUser.role || 'user'),
    };

    res.status(201).json({
      message: 'Account created successfully',
      token: signUserToken(authUser),
      user: authUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create account' });
  }
});

app.post('/api/users/login', async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''));
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const userRecord = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('email', sql.NVarChar(255), email)
          .query(`
            SELECT TOP 1 id, name, email, password_hash, role, created_at
            FROM users
            WHERE email = @email
              AND role = 'user'
          `);

        return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
      },
      async () => (await getLocalUserByEmail(email)) as Record<string, unknown> | null,
      'user login lookup',
    );

    if (!userRecord || String(userRecord.role || 'user') !== 'user') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, String(userRecord.password_hash || ''));

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const authUser = {
      id: Number(userRecord.id),
      name: String(userRecord.name || buildUserNameFromEmail(email)),
      email: String(userRecord.email || email),
      role: String(userRecord.role || 'user'),
    };

    res.json({
      message: 'Login successful',
      token: signUserToken(authUser),
      user: authUser,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to login' });
  }
});

app.get('/api/users/me', requireUserAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User login required' });
    }

    const userRecord = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('id', sql.Int, userId)
          .query(`
            SELECT TOP 1 id, name, email, role, created_at
            FROM users
            WHERE id = @id
          `);

        return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
      },
      async () => (await getLocalUserByEmail(req.user?.email || '')) as Record<string, unknown> | null,
      'current user lookup',
    );

    if (!userRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: Number(userRecord.id),
        name: String(userRecord.name || ''),
        email: String(userRecord.email || ''),
        role: String(userRecord.role || 'user'),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to load user profile' });
  }
});

app.post(
  '/api/poems',
  requireAdminAuth,
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'backgroundMusic', maxCount: 1 },
    { name: 'poemPdf', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, description, price, freePages, poemContent } = req.body;
      const files = (req.files ?? {}) as UploadedFiles;
      const coverImage = files.coverImage?.[0];
      const backgroundMusic = files.backgroundMusic?.[0];
      const poemPdf = files.poemPdf?.[0];
      let storageMode: 'database' | 'local_fallback' = 'database';

      if (!title || !price) {
        return res.status(400).json({ error: 'Title and price are required' });
      }

      const parsedPrice = Number(price);
      const parsedFreePages = freePages ? Number(freePages) : 2;

      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Price must be a valid positive number' });
      }

      if (Number.isNaN(parsedFreePages) || parsedFreePages < 1) {
        return res.status(400).json({ error: 'Free pages must be at least 1' });
      }

      let effectivePoemContent = String(poemContent || '').trim();
      const pdfFileUrl = poemPdf ? `/uploads/pdfs/${poemPdf.filename}` : null;

      if (poemPdf) {
        try {
          const pdfBuffer = fs.readFileSync(poemPdf.path);
          const pdfPages = await extractTextPagesFromPdfBuffer(pdfBuffer);

          if (pdfPages.length > 0) {
            // Use [PDF_PAGE] marker for pages without text to ensure they show up page-wise
            effectivePoemContent = pdfPages
              .map((p) => p.trim() || '[PDF_PAGE]')
              .join('\n\n---PAGE---\n\n');
          } else if (!effectivePoemContent) {
            effectivePoemContent = '[PDF_PAGE]';
          }
          // If nonEmptyPages.length === 0 but effectivePoemContent ALREADY had manual text,
          // we keep the manual text.
        } catch (pdfErr) {
          console.error('PDF extraction failed:', pdfErr);
          if (!effectivePoemContent) {
            effectivePoemContent = '[PDF_PAGE]';
          }
        }
      }

      if (!effectivePoemContent) {
        return res.status(400).json({ error: 'Please provide poem text or upload a PDF.' });
      }

      const createdPoem = await withStorageFallback<Record<string, unknown>>(
        async () => {
          const pool = await getDatabasePool();
          const transaction = new sql.Transaction(pool);
          await transaction.begin();

          try {
            const result = await transaction
              .request()
              .input('title', sql.NVarChar(255), title)
              .input('description', sql.NVarChar(sql.MAX), description || '')
              .input(
                'coverImageUrl',
                sql.NVarChar(sql.MAX),
                coverImage ? `/uploads/covers/${coverImage.filename}` : null,
              )
              .input(
                'musicFileUrl',
                sql.NVarChar(sql.MAX),
                backgroundMusic ? `/uploads/audio/${backgroundMusic.filename}` : null,
              )
              .input('pdfFileUrl', sql.NVarChar(sql.MAX), pdfFileUrl)
              .input('price', sql.Decimal(10, 2), parsedPrice)
              .input('freePages', sql.Int, parsedFreePages).query(`
                INSERT INTO poems (
                  title,
                  description,
                  cover_image_url,
                  pdf_file_url,
                  music_file_url,
                  price,
                  free_pages
                )
                OUTPUT INSERTED.*
                VALUES (
                  @title,
                  @description,
                  @coverImageUrl,
                  @pdfFileUrl,
                  @musicFileUrl,
                  @price,
                  @freePages
                )
              `);

            const insertedPoem = result.recordset[0];
            await savePoemPages(transaction, Number(insertedPoem.id), effectivePoemContent);
            await transaction.commit();

            return insertedPoem as Record<string, unknown>;
          } catch (error) {
            await transaction.rollback();
            throw error;
          }
        },
        async () => {
          storageMode = 'local_fallback';

          return (await createLocalPoem({
            title,
            description: description || '',
            coverImageUrl: coverImage ? `/uploads/covers/${coverImage.filename}` : null,
            musicFileUrl: backgroundMusic ? `/uploads/audio/${backgroundMusic.filename}` : null,
            pdfFileUrl,
            price: parsedPrice,
            freePages: parsedFreePages,
            poemContent: effectivePoemContent,
          })) as Record<string, unknown>;
        },
        'poem creation',
      );

      res.status(201).json({
        message:
          storageMode === 'database'
            ? 'Poem uploaded successfully'
            : 'Poem was saved locally because SQL Server is unavailable',
        storage: storageMode,
        poem: serializePoem(req, createdPoem as Record<string, unknown>),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to upload poem' });
    }
  },
);

app.get('/api/poems/:id', async (req, res) => {
  try {
    const poemId = parsePoemId(req.params.id);

    if (!poemId) {
      return res.status(400).json({ error: 'Invalid poem id' });
    }

    const poem = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool.request().input('id', sql.Int, poemId).query('SELECT * FROM poems WHERE id = @id');
        return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
      },
      async () => (await getLocalPoemById(poemId)) as Record<string, unknown> | null,
      'poem lookup by id',
    );

    if (!poem) {
      return res.status(404).json({ error: 'Poem not found' });
    }

    res.json(serializePoem(req, poem as Record<string, unknown>));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put(
  '/api/poems/:id',
  requireAdminAuth,
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'backgroundMusic', maxCount: 1 },
    { name: 'poemPdf', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const poemId = parsePoemId(String(req.params.id));

      if (!poemId) {
        return res.status(400).json({ error: 'Invalid poem id' });
      }

      const { title, description, price, freePages, poemContent } = req.body;
      const files = (req.files ?? {}) as UploadedFiles;
      const coverImage = files.coverImage?.[0];
      const backgroundMusic = files.backgroundMusic?.[0];
      const poemPdf = files.poemPdf?.[0];

      if (!title || price === undefined || price === null || !String(poemContent || '').trim()) {
        return res.status(400).json({ error: 'Title, price, and poem text are required' });
      }

      const parsedPrice = Number(price);
      const parsedFreePages = freePages ? Number(freePages) : 2;

      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Price must be a valid positive number' });
      }

      if (Number.isNaN(parsedFreePages) || parsedFreePages < 1) {
        return res.status(400).json({ error: 'Free pages must be at least 1' });
      }

      let effectivePoemContent = String(poemContent || '').trim();
      if (poemPdf) {
        try {
          const pdfBuffer = fs.readFileSync(poemPdf.path);
          const pdfPages = await extractTextPagesFromPdfBuffer(pdfBuffer);

          if (pdfPages.length > 0) {
            effectivePoemContent = pdfPages
              .map((p) => p.trim() || '[PDF_PAGE]')
              .join('\n\n---PAGE---\n\n');
          } else if (!effectivePoemContent) {
            effectivePoemContent = '[PDF_PAGE]';
          }
        } catch (pdfErr) {
          console.error('PDF extraction failed:', pdfErr);
          if (!effectivePoemContent) {
            effectivePoemContent = '[PDF_PAGE]';
          }
        }
      }

      const updatedPoem = await withStorageFallback<Record<string, unknown> | null>(
        async () => {
          const pool = await getDatabasePool();
          const transaction = new sql.Transaction(pool);
          await transaction.begin();

          try {
            let updateQuery = `
              UPDATE poems
              SET
                title = @title,
                description = @description,
                price = @price,
                free_pages = @freePages
            `;

            const request = transaction.request()
              .input('id', sql.Int, poemId)
              .input('title', sql.NVarChar(255), title)
              .input('description', sql.NVarChar(sql.MAX), description || '')
              .input('price', sql.Decimal(10, 2), parsedPrice)
              .input('freePages', sql.Int, parsedFreePages);

            if (coverImage) {
              updateQuery += `, cover_image_url = @coverImageUrl`;
              request.input('coverImageUrl', sql.NVarChar(sql.MAX), `/uploads/covers/${coverImage.filename}`);
            }

            if (backgroundMusic) {
              updateQuery += `, music_file_url = @musicFileUrl`;
              request.input('musicFileUrl', sql.NVarChar(sql.MAX), `/uploads/audio/${backgroundMusic.filename}`);
            }

            if (poemPdf) {
              updateQuery += `, pdf_file_url = @pdfFileUrl`;
              request.input('pdfFileUrl', sql.NVarChar(sql.MAX), `/uploads/pdfs/${poemPdf.filename}`);
            }

            updateQuery += `
              OUTPUT INSERTED.*
              WHERE id = @id
            `;

            const result = await request.query(updateQuery);

            if (result.recordset.length === 0) {
              await transaction.rollback();
              return null;
            }

            await savePoemPages(transaction, poemId, effectivePoemContent);
            await transaction.commit();

            return result.recordset[0] as Record<string, unknown>;
          } catch (error) {
            await transaction.rollback();
            throw error;
          }
        },
        async () =>
          (await updateLocalPoem(poemId, {
            title,
            description: description || '',
            price: parsedPrice,
            freePages: parsedFreePages,
            poemContent: effectivePoemContent,
            coverImageUrl: coverImage ? `/uploads/covers/${coverImage.filename}` : undefined,
            musicFileUrl: backgroundMusic ? `/uploads/audio/${backgroundMusic.filename}` : undefined,
            pdfFileUrl: poemPdf ? `/uploads/pdfs/${poemPdf.filename}` : undefined,
          })) as Record<string, unknown> | null,
        'poem update',
      );

    if (!updatedPoem) {
      return res.status(404).json({ error: 'Poem not found' });
    }

    res.json({
      message: 'Poem updated successfully',
      poem: serializePoem(req, updatedPoem as Record<string, unknown>),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update poem' });
  }
});

app.delete('/api/poems/:id', requireAdminAuth, async (req, res) => {
  try {
    const poemId = parsePoemId(String(req.params.id));

    if (!poemId) {
      return res.status(400).json({ error: 'Invalid poem id' });
    }

    const deletedPoem = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('id', sql.Int, poemId)
          .query('DELETE FROM poems OUTPUT DELETED.id, DELETED.title WHERE id = @id');

        return (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
      },
      async () => (await deleteLocalPoem(poemId)) as Record<string, unknown> | null,
      'poem deletion',
    );

    if (!deletedPoem) {
      return res.status(404).json({ error: 'Poem not found' });
    }

    res.json({
      message: 'Poem deleted successfully',
      deletedPoem,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete poem' });
  }
});

app.get('/api/admin/poems/:id/content', requireAdminAuth, async (req, res) => {
  try {
    const poemId = parsePoemId(String(req.params.id));

    if (!poemId) {
      return res.status(400).json({ error: 'Invalid poem id' });
    }

    const readData = await withStorageFallback<{ pages: Record<string, unknown>[] } | null>(
      async () => {
        const pool = await getDatabasePool();
        const poemResult = await pool
          .request()
          .input('id', sql.Int, poemId)
          .query('SELECT id FROM poems WHERE id = @id');

        if (poemResult.recordset.length === 0) {
          return null;
        }

        const pagesResult = await pool
          .request()
          .input('id', sql.Int, poemId)
          .query('SELECT * FROM poem_pages WHERE poem_id = @id ORDER BY page_number ASC');

        return {
          pages: pagesResult.recordset as Record<string, unknown>[],
        };
      },
      async () => {
        const localReadData = await readLocalPoemPagesAdmin(poemId);

        if (!localReadData) {
          return null;
        }

        return {
          pages: localReadData.pages as Record<string, unknown>[],
        };
      },
      'admin poem content lookup',
    );

    if (!readData) {
      return res.status(404).json({ error: 'Poem not found' });
    }

    res.json({
      pages: readData.pages.map((page: Record<string, unknown>) => ({
        ...page,
        content:
          (page.content_text as string | null | undefined) ||
          toPublicUrl(req, page.content_url as string | null | undefined),
        content_url: toPublicUrl(req, page.content_url as string | null | undefined),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load poem content' });
  }
});

app.get('/api/poems/:id/read', requireUserAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const poemId = parsePoemId(String(req.params.id));

    if (!poemId) {
      return res.status(400).json({ error: 'Invalid poem id' });
    }

    const userId = req.user!.id;

    const readData = await withStorageFallback<{
      pages: Record<string, unknown>[];
      hasMorePages: boolean;
      isPurchased: boolean;
    } | null>(
      async () => {
        const pool = await getDatabasePool();
        const poemResult = await pool
          .request()
          .input('id', sql.Int, poemId)
          .query('SELECT free_pages FROM poems WHERE id = @id');

        if (poemResult.recordset.length === 0) {
          return null;
        }

        const verifiedResult = await pool
          .request()
          .input('poemId', sql.Int, poemId)
          .input('userId', sql.Int, userId)
          .query(
            `SELECT TOP 1 1 AS ok FROM payments
             WHERE poem_id = @poemId AND user_id = @userId AND status = N'verified'`,
          );

        const isPurchased = req.user?.role === 'admin' || verifiedResult.recordset.length > 0;

        const freePages = Number(poemResult.recordset[0].free_pages) || 2;
        const countResult = await pool
          .request()
          .input('id', sql.Int, poemId)
          .query('SELECT COUNT(*) AS total FROM poem_pages WHERE poem_id = @id');
        const totalPages = Number(countResult.recordset[0]?.total) || 0;

        const pagesRequest = pool.request().input('id', sql.Int, poemId);
        const pagesResult = isPurchased
          ? await pagesRequest.query('SELECT * FROM poem_pages WHERE poem_id = @id ORDER BY page_number ASC')
          : await pagesRequest
              .input('freePages', sql.Int, freePages)
              .query(
                'SELECT TOP (@freePages) * FROM poem_pages WHERE poem_id = @id ORDER BY page_number ASC',
              );

        return {
          pages: pagesResult.recordset as Record<string, unknown>[],
          hasMorePages: !isPurchased && totalPages > freePages,
          isPurchased,
        };
      },
      async () => {
        const localReadData = await readLocalPoemPages(poemId, userId);

        if (!localReadData) {
          return null;
        }

        return {
          pages: localReadData.pages as Record<string, unknown>[],
          hasMorePages: localReadData.hasMorePages,
          isPurchased: localReadData.isPurchased,
        };
      },
      'poem reading',
    );

    if (!readData) {
      return res.status(404).json({ error: 'Poem not found' });
    }

    res.json({
      pages: readData.pages.map((page: Record<string, unknown>) => ({
        ...page,
        content:
          (page.content_text as string | null | undefined) ||
          toPublicUrl(req, page.content_url as string | null | undefined),
        content_url: toPublicUrl(req, page.content_url as string | null | undefined),
      })),
      isPurchased: readData.isPurchased,
      hasMorePages: readData.hasMorePages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/payments', upload.single('paymentScreenshot'), requireUserAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { userName, upiRefId, poemId } = req.body;
    const screenshot = req.file;
    const parsedPoemId = parsePoemId(String(poemId || ''));
    const userId = req.user!.id;
    let storageMode: 'database' | 'local_fallback' = 'database';

    if (!parsedPoemId) {
      return res.status(400).json({ error: 'A valid poem id is required' });
    }

    if (!String(userName || '').trim()) {
      return res.status(400).json({ error: 'User name is required' });
    }

    if (!/^\d{12}$/.test(String(upiRefId || '').trim())) {
      return res.status(400).json({ error: 'UPI reference id must be 12 digits' });
    }

    const createdPayment = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const poemResult = await pool
          .request()
          .input('id', sql.Int, parsedPoemId)
          .query('SELECT id, title FROM poems WHERE id = @id');

        if (poemResult.recordset.length === 0) {
          return null;
        }

        const result = await pool
          .request()
          .input('poemId', sql.Int, parsedPoemId)
          .input('userId', sql.Int, userId)
          .input('userName', sql.NVarChar(255), String(userName).trim())
          .input('upiRefId', sql.NVarChar(255), String(upiRefId).trim())
          .input(
            'screenshotUrl',
            sql.NVarChar(sql.MAX),
            screenshot ? `/uploads/payments/${screenshot.filename}` : null,
          ).query(`
            INSERT INTO payments (
              poem_id,
              user_id,
              user_name,
              upi_ref_id,
              screenshot_url
            )
            OUTPUT INSERTED.*
            VALUES (
              @poemId,
              @userId,
              @userName,
              @upiRefId,
              @screenshotUrl
            )
          `);

        return {
          ...result.recordset[0],
          poem_title: poemResult.recordset[0].title,
        } as Record<string, unknown>;
      },
      async () => {
        storageMode = 'local_fallback';

        return (await createLocalPayment({
          poemId: parsedPoemId,
          userId,
          userName: String(userName).trim(),
          upiRefId: String(upiRefId).trim(),
          screenshotUrl: screenshot ? `/uploads/payments/${screenshot.filename}` : null,
        })) as Record<string, unknown> | null;
      },
      'payment creation',
    );

    if (!createdPayment) {
      return res.status(404).json({ error: 'Poem not found' });
    }

    res.status(201).json({
      success: true,
      message:
        storageMode === 'database'
          ? 'Payment submitted for approval'
          : 'Payment was saved locally because SQL Server is unavailable',
      status: 'pending',
      storage: storageMode,
      payment: createdPayment,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Payment failed to process' });
  }
});

app.get('/api/payments', requireAdminAuth, async (req, res) => {
  try {
    const payments = await withStorageFallback<Record<string, unknown>[]>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool.request().query(`
          SELECT
            payments.id,
            payments.poem_id,
            payments.user_name,
            payments.upi_ref_id,
            payments.screenshot_url,
            payments.status,
            payments.created_at,
            poems.title AS poem_title
          FROM payments
          INNER JOIN poems ON poems.id = payments.poem_id
          ORDER BY payments.created_at DESC, payments.id DESC
        `);

        return result.recordset as Record<string, unknown>[];
      },
      async () => (await listLocalPayments()) as Record<string, unknown>[],
      'payment listing',
    );

    res.json(
      payments.map((payment) => ({
        ...payment,
        screenshot_url: toPublicUrl(req, payment.screenshot_url as string | null | undefined),
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

app.patch('/api/payments/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const paymentId = Number(req.params.id);
    const status = String(req.body.status || '').trim().toLowerCase();

    if (!Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }

    if (!allowedPaymentStatuses.has(status)) {
      return res.status(400).json({ error: 'Status must be pending, verified, or rejected' });
    }

    const updatedPayment = await withStorageFallback<Record<string, unknown> | null>(
      async () => {
        const pool = await getDatabasePool();
        const result = await pool
          .request()
          .input('id', sql.Int, paymentId)
          .input('status', sql.NVarChar(50), status).query(`
            UPDATE payments
            SET status = @status
            OUTPUT
              INSERTED.id,
              INSERTED.poem_id,
              INSERTED.user_name,
              INSERTED.upi_ref_id,
              INSERTED.screenshot_url,
              INSERTED.status,
              INSERTED.created_at
            WHERE id = @id
          `);

        if (result.recordset.length === 0) {
          return null;
        }

        const payment = result.recordset[0] as Record<string, unknown>;
        const poemResult = await pool
          .request()
          .input('poemId', sql.Int, Number(payment.poem_id))
          .query('SELECT title FROM poems WHERE id = @poemId');

        return {
          ...payment,
          poem_title: poemResult.recordset[0]?.title ?? 'Unknown poem',
        };
      },
      async () =>
        (await updateLocalPaymentStatus({
          paymentId,
          status,
        })) as Record<string, unknown> | null,
      'payment status update',
    );

    if (!updatedPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({
      message: `Payment marked as ${status}`,
      payment: {
        ...updatedPayment,
        screenshot_url: toPublicUrl(req, updatedPayment.screenshot_url as string | null | undefined),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update payment status' });
  }
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }

  next();
});

const startServer = async () => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  void ensureSchema().catch((error) => {
    if (allowLocalFallback) {
      console.warn('Database initialization failed during startup. Local storage fallback is enabled, so the server will continue on port 5000.');
      return;
    }

    console.error('Database initialization failed during startup. Server will stay up and retry on the next request.', error);
  });
};

startServer();
