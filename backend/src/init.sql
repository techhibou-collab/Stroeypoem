IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        email NVARCHAR(255) NOT NULL UNIQUE,
        password_hash NVARCHAR(MAX) NOT NULL,
        role NVARCHAR(50) NOT NULL CONSTRAINT DF_users_role DEFAULT 'user',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME()
    );
END;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.users
    WHERE role = 'admin'
      AND email = 'sunheriyaadonkemoti@gmail.com'
)
BEGIN
    INSERT INTO dbo.users (name, email, password_hash, role)
    VALUES (
        'Sunheri Yaadon Ke Moti Admin',
        'sunheriyaadonkemoti@gmail.com',
        '$2b$10$pI992GEpKpU5ts8QgArWX.J/5vpGSukTTkBGaUab8Bn1b7W7OkMG.',
        'admin'
    );
END;

IF OBJECT_ID('dbo.poems', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.poems (
        id INT IDENTITY(1,1) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX) NULL,
        cover_image_url NVARCHAR(MAX) NULL,
        pdf_file_url NVARCHAR(MAX) NULL,
        music_file_url NVARCHAR(MAX) NULL,
        preview_pdf_url NVARCHAR(MAX) NULL,
        price DECIMAL(10,2) NOT NULL,
        free_pages INT NOT NULL CONSTRAINT DF_poems_free_pages DEFAULT 2,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_poems_created_at DEFAULT SYSUTCDATETIME()
    );
END;

IF COL_LENGTH('dbo.poems', 'description') IS NULL
BEGIN
    ALTER TABLE dbo.poems ADD description NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH('dbo.poems', 'cover_image_url') IS NULL
BEGIN
    ALTER TABLE dbo.poems ADD cover_image_url NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH('dbo.poems', 'pdf_file_url') IS NULL
BEGIN
    ALTER TABLE dbo.poems ADD pdf_file_url NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH('dbo.poems', 'music_file_url') IS NULL
BEGIN
    ALTER TABLE dbo.poems ADD music_file_url NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH('dbo.poems', 'preview_pdf_url') IS NULL
BEGIN
    ALTER TABLE dbo.poems ADD preview_pdf_url NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH('dbo.poems', 'free_pages') IS NULL
BEGIN
    ALTER TABLE dbo.poems ADD free_pages INT NOT NULL CONSTRAINT DF_poems_free_pages_legacy DEFAULT 2;
END;

IF COL_LENGTH('dbo.poems', 'created_at') IS NULL
BEGIN
    ALTER TABLE dbo.poems ADD created_at DATETIME2 NOT NULL CONSTRAINT DF_poems_created_at_legacy DEFAULT SYSUTCDATETIME();
END;

IF OBJECT_ID('dbo.poem_pages', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.poem_pages (
        id INT IDENTITY(1,1) PRIMARY KEY,
        poem_id INT NOT NULL,
        page_number INT NOT NULL,
        content_url NVARCHAR(MAX) NULL,
        content_text NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_poem_pages_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_poem_pages_poem FOREIGN KEY (poem_id) REFERENCES dbo.poems(id) ON DELETE CASCADE
    );
END;

IF COL_LENGTH('dbo.poem_pages', 'content_text') IS NULL
BEGIN
    ALTER TABLE dbo.poem_pages ADD content_text NVARCHAR(MAX) NULL;
END;

IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'poem_pages'
      AND COLUMN_NAME = 'content_url'
      AND IS_NULLABLE = 'NO'
)
BEGIN
    ALTER TABLE dbo.poem_pages ALTER COLUMN content_url NVARCHAR(MAX) NULL;
END;

EXEC sp_executesql N'
    UPDATE dbo.poem_pages
    SET content_text = content_url
    WHERE content_text IS NULL
      AND content_url IS NOT NULL
      AND content_url NOT LIKE ''http%''
      AND content_url NOT LIKE ''/uploads/%'';
';

IF OBJECT_ID('dbo.payments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.payments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NULL,
        poem_id INT NOT NULL,
        user_name NVARCHAR(255) NOT NULL,
        upi_ref_id NVARCHAR(255) NOT NULL,
        screenshot_url NVARCHAR(MAX) NULL,
        status NVARCHAR(50) NOT NULL CONSTRAINT DF_payments_status DEFAULT 'pending',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_payments_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_payments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_payments_poem FOREIGN KEY (poem_id) REFERENCES dbo.poems(id)
    );
END;

IF COL_LENGTH('dbo.payments', 'user_name') IS NULL
BEGIN
    ALTER TABLE dbo.payments ADD user_name NVARCHAR(255) NULL;
END;

IF COL_LENGTH('dbo.payments', 'user_name') IS NOT NULL
BEGIN
    EXEC sp_executesql N'
        UPDATE dbo.payments
        SET user_name = ''Unknown User''
        WHERE user_name IS NULL;

        ALTER TABLE dbo.payments
        ALTER COLUMN user_name NVARCHAR(255) NOT NULL;
    ';
END;

IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'payments'
      AND COLUMN_NAME = 'screenshot_url'
      AND IS_NULLABLE = 'NO'
)
BEGIN
    ALTER TABLE dbo.payments ALTER COLUMN screenshot_url NVARCHAR(MAX) NULL;
END;

IF OBJECT_ID('dbo.purchases', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.purchases (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NULL,
        poem_id INT NULL,
        payment_id INT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_purchases_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_purchases_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_purchases_poem FOREIGN KEY (poem_id) REFERENCES dbo.poems(id),
        CONSTRAINT FK_purchases_payment FOREIGN KEY (payment_id) REFERENCES dbo.payments(id)
    );
END;

IF OBJECT_ID('dbo.api_names', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.api_names (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_api_names_created_at DEFAULT SYSUTCDATETIME()
    );
END;

IF OBJECT_ID('dbo.site_settings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.site_settings (
        id INT NOT NULL CONSTRAINT PK_site_settings PRIMARY KEY,
        payment_qr_image_url NVARCHAR(MAX) NULL,
        payment_upi_id NVARCHAR(255) NULL,
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_site_settings_updated DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_site_settings_singleton CHECK (id = 1)
    );
    INSERT INTO dbo.site_settings (id) VALUES (1);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.poems WHERE title = 'The Midnight Shadow')
BEGIN
    INSERT INTO dbo.poems (title, description, price, free_pages, cover_image_url)
    VALUES (
        'The Midnight Shadow',
        'A beautiful poem about the silent nights and dancing shadows.',
        50.00,
        2,
        'https://via.placeholder.com/300x400/000000/ffffff?text=The+Midnight+Shadow'
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.poem_pages WHERE poem_id = 1 AND page_number = 1)
BEGIN
    EXEC sp_executesql N'
        INSERT INTO dbo.poem_pages (poem_id, page_number, content_text) VALUES
        (1, 1, ''The shadows danced, wild and free...''),
        (1, 2, ''Under the pale moonlight they played...''),
        (1, 3, ''But silence broke, when morning came...''),
        (1, 4, ''And all the magic washed away.'');
    ';
END;
