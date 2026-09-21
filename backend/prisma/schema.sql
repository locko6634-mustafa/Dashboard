-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenants" (
    "id" UUID NOT NULL,
    "salon_adi" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "clients" (
    "id" UUID NOT NULL,
    "ad_soyad" VARCHAR(255) NOT NULL,
    "telefon" VARCHAR(50) NOT NULL,
    "kronik_rahatsizlik" TEXT,
    "paket_adi" VARCHAR(255),
    "toplam_seans" INTEGER DEFAULT 0,
    "gelinen_seans" INTEGER DEFAULT 0,
    "toplam_tutar" DECIMAL(12,2) DEFAULT 0,
    "alinan_odeme" DECIMAL(12,2) DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" UUID NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "appointments" (
    "id" UUID NOT NULL,
    "hasta_id" UUID,
    "tarih" VARCHAR(20) NOT NULL,
    "baslangic_saati" VARCHAR(20) NOT NULL,
    "bitis_saati" VARCHAR(20),
    "durum" VARCHAR(50) DEFAULT 'Bekliyor',
    "hizmet" VARCHAR(100),
    "sure" INTEGER DEFAULT 30,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "tenant_id" UUID NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "hasta_notlari" (
    "id" UUID NOT NULL,
    "hasta_id" UUID,
    "not_metni" TEXT NOT NULL,
    "tarih" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" UUID NOT NULL,

    CONSTRAINT "hasta_notlari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "app_settings" (
    "setting_key" VARCHAR(100) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "setting_value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("setting_key","tenant_id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "conversation_states" (
    "conversation_id" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "current_intent" VARCHAR(100),
    "current_stage" VARCHAR(100),
    "context_data" JSONB DEFAULT '{}',
    "retry_count" INTEGER DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_states_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clients_tenant_id_idx" ON "clients"("tenant_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "clients_tenant_id_telefon_idx" ON "clients"("tenant_id", "telefon");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_tarih_idx" ON "appointments"("tenant_id", "tarih");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_tenant_id_deleted_at_idx" ON "appointments"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hasta_notlari_tenant_id_hasta_id_idx" ON "hasta_notlari"("tenant_id", "hasta_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_states_phone_number_idx" ON "conversation_states"("phone_number");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_tenant_id_fkey') THEN
        ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_tenant_id_fkey') THEN
        ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_hasta_id_fkey') THEN
        ALTER TABLE "appointments" ADD CONSTRAINT "appointments_hasta_id_fkey" FOREIGN KEY ("hasta_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hasta_notlari_tenant_id_fkey') THEN
        ALTER TABLE "hasta_notlari" ADD CONSTRAINT "hasta_notlari_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hasta_notlari_hasta_id_fkey') THEN
        ALTER TABLE "hasta_notlari" ADD CONSTRAINT "hasta_notlari_hasta_id_fkey" FOREIGN KEY ("hasta_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_tenant_id_fkey') THEN
        ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
