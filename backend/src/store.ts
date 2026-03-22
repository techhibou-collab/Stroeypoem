import fs from 'fs/promises';
import path from 'path';

export type StoredPoem = {
  id: number;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  pdf_file_url: string | null;
  music_file_url: string | null;
  price: number;
  free_pages: number;
  created_at: string;
};

export type StoredPoemPage = {
  id: number;
  poem_id: number;
  page_number: number;
  content_url: string | null;
  content_text: string | null;
  created_at: string;
};

export type StoredPayment = {
  id: number;
  poem_id: number;
  user_name: string;
  upi_ref_id: string;
  screenshot_url: string | null;
  status: string;
  created_at: string;
};

export type StoredUser = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
};

type LocalStoreData = {
  nextUserId: number;
  nextPoemId: number;
  nextPageId: number;
  nextPaymentId: number;
  users: StoredUser[];
  poems: StoredPoem[];
  poemPages: StoredPoemPage[];
  payments: StoredPayment[];
};

type CreatePoemInput = {
  title: string;
  description: string;
  coverImageUrl: string | null;
  musicFileUrl: string | null;
  price: number;
  freePages: number;
  poemContent: string;
};

type UpdatePoemInput = {
  title: string;
  description: string;
  price: number;
  freePages: number;
  poemContent: string;
};

type CreatePaymentInput = {
  poemId: number;
  userName: string;
  upiRefId: string;
  screenshotUrl: string | null;
};

type UpdatePaymentStatusInput = {
  paymentId: number;
  status: string;
};

type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role?: string;
};

const dataDirectory = path.resolve(__dirname, '..', 'data');
const storeFilePath = path.join(dataDirectory, 'poems-store.json');

const createEmptyStore = (): LocalStoreData => ({
  nextUserId: 1,
  nextPoemId: 1,
  nextPageId: 1,
  nextPaymentId: 1,
  users: [],
  poems: [],
  poemPages: [],
  payments: [],
});

const parsePoemPages = (poemContent: string) =>
  poemContent
    .split(/\r?\n\s*---PAGE---\s*\r?\n/g)
    .map((page) => page.trim())
    .filter(Boolean);

const ensureStoreFile = async () => {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(storeFilePath);
  } catch {
    await fs.writeFile(storeFilePath, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
};

const readStore = async (): Promise<LocalStoreData> => {
  await ensureStoreFile();
  const content = await fs.readFile(storeFilePath, 'utf8');

  try {
    const parsed = JSON.parse(content) as Partial<LocalStoreData>;
    return {
      nextUserId: parsed.nextUserId ?? 1,
      nextPoemId: parsed.nextPoemId ?? 1,
      nextPageId: parsed.nextPageId ?? 1,
      nextPaymentId: parsed.nextPaymentId ?? 1,
      users: parsed.users ?? [],
      poems: parsed.poems ?? [],
      poemPages: parsed.poemPages ?? [],
      payments: parsed.payments ?? [],
    };
  } catch {
    const emptyStore = createEmptyStore();
    await fs.writeFile(storeFilePath, JSON.stringify(emptyStore, null, 2), 'utf8');
    return emptyStore;
  }
};

const writeStore = async (store: LocalStoreData) => {
  await ensureStoreFile();
  await fs.writeFile(storeFilePath, JSON.stringify(store, null, 2), 'utf8');
};

const sortPoems = (poems: StoredPoem[]) =>
  [...poems].sort((left, right) => {
    if (left.created_at === right.created_at) {
      return right.id - left.id;
    }

    return right.created_at.localeCompare(left.created_at);
  });

export const listLocalPoems = async () => {
  const store = await readStore();
  return sortPoems(store.poems);
};

export const getLocalUserByEmail = async (email: string) => {
  const store = await readStore();
  return store.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
};

export const createLocalUser = async ({ name, email, passwordHash, role = 'user' }: CreateUserInput) => {
  const store = await readStore();
  const normalizedEmail = email.toLowerCase();

  if (store.users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    throw new Error('A user with this email already exists');
  }

  const user: StoredUser = {
    id: store.nextUserId,
    name,
    email: normalizedEmail,
    password_hash: passwordHash,
    role,
    created_at: new Date().toISOString(),
  };

  store.nextUserId += 1;
  store.users.push(user);
  await writeStore(store);

  return user;
};

export const getLocalPoemById = async (poemId: number) => {
  const store = await readStore();
  return store.poems.find((poem) => poem.id === poemId) ?? null;
};

export const getLocalPoemByTitle = async (title: string) => {
  const poems = await listLocalPoems();
  return poems.find((poem) => poem.title === title) ?? null;
};

export const createLocalPoem = async ({
  title,
  description,
  coverImageUrl,
  musicFileUrl,
  price,
  freePages,
  poemContent,
}: CreatePoemInput) => {
  const pages = parsePoemPages(poemContent);

  if (pages.length === 0) {
    throw new Error('Poem text is required');
  }

  const store = await readStore();
  const createdAt = new Date().toISOString();
  const poem: StoredPoem = {
    id: store.nextPoemId,
    title,
    description: description || '',
    cover_image_url: coverImageUrl,
    pdf_file_url: null,
    music_file_url: musicFileUrl,
    price,
    free_pages: freePages,
    created_at: createdAt,
  };

  store.nextPoemId += 1;
  store.poems.push(poem);

  for (const [index, page] of pages.entries()) {
    store.poemPages.push({
      id: store.nextPageId,
      poem_id: poem.id,
      page_number: index + 1,
      content_url: null,
      content_text: page,
      created_at: createdAt,
    });
    store.nextPageId += 1;
  }

  await writeStore(store);
  return poem;
};

export const updateLocalPoem = async (poemId: number, { title, description, price, freePages, poemContent }: UpdatePoemInput) => {
  const pages = parsePoemPages(poemContent);

  if (pages.length === 0) {
    throw new Error('Poem text is required');
  }

  const store = await readStore();
  const poem = store.poems.find((entry) => entry.id === poemId);

  if (!poem) {
    return null;
  }

  poem.title = title;
  poem.description = description || '';
  poem.price = price;
  poem.free_pages = freePages;
  poem.pdf_file_url = null;

  store.poemPages = store.poemPages.filter((page) => page.poem_id !== poemId);

  for (const [index, page] of pages.entries()) {
    store.poemPages.push({
      id: store.nextPageId,
      poem_id: poemId,
      page_number: index + 1,
      content_url: null,
      content_text: page,
      created_at: new Date().toISOString(),
    });
    store.nextPageId += 1;
  }

  await writeStore(store);
  return poem;
};

export const deleteLocalPoem = async (poemId: number) => {
  const store = await readStore();
  const poemIndex = store.poems.findIndex((poem) => poem.id === poemId);

  if (poemIndex === -1) {
    return null;
  }

  const [deletedPoem] = store.poems.splice(poemIndex, 1);
  store.poemPages = store.poemPages.filter((page) => page.poem_id !== poemId);
  await writeStore(store);

  return {
    id: deletedPoem.id,
    title: deletedPoem.title,
  };
};

export const readLocalPoemPages = async (poemId: number, isPurchased: boolean) => {
  const store = await readStore();
  const poem = store.poems.find((entry) => entry.id === poemId);

  if (!poem) {
    return null;
  }

  const sortedPages = [...store.poemPages]
    .filter((page) => page.poem_id === poemId)
    .sort((left, right) => left.page_number - right.page_number);

  const pages = isPurchased ? sortedPages : sortedPages.slice(0, poem.free_pages);

  return {
    freePages: poem.free_pages,
    pages,
    hasMorePages: sortedPages.length > pages.length,
  };
};

export const createLocalPayment = async ({ poemId, userName, upiRefId, screenshotUrl }: CreatePaymentInput) => {
  const store = await readStore();
  const poem = store.poems.find((entry) => entry.id === poemId);

  if (!poem) {
    return null;
  }

  const payment: StoredPayment = {
    id: store.nextPaymentId,
    poem_id: poemId,
    user_name: userName,
    upi_ref_id: upiRefId,
    screenshot_url: screenshotUrl,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  store.nextPaymentId += 1;
  store.payments.push(payment);
  await writeStore(store);

  return {
    ...payment,
    poem_title: poem.title,
  };
};

export const listLocalPayments = async () => {
  const store = await readStore();

  return [...store.payments]
    .sort((left, right) => {
      if (left.created_at === right.created_at) {
        return right.id - left.id;
      }

      return right.created_at.localeCompare(left.created_at);
    })
    .map((payment) => ({
      ...payment,
      poem_title: store.poems.find((poem) => poem.id === payment.poem_id)?.title ?? 'Unknown poem',
    }));
};

export const updateLocalPaymentStatus = async ({ paymentId, status }: UpdatePaymentStatusInput) => {
  const store = await readStore();
  const payment = store.payments.find((entry) => entry.id === paymentId);

  if (!payment) {
    return null;
  }

  payment.status = status;
  await writeStore(store);

  return {
    ...payment,
    poem_title: store.poems.find((poem) => poem.id === payment.poem_id)?.title ?? 'Unknown poem',
  };
};
