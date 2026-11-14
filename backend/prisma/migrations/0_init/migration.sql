-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "salon_adi" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "whatsapp_phone" VARCHAR(50),
    "n8n_webhook_url" VARCHAR(500),
    "chatwoot_inbox_id" VARCHAR(100),
    "api_key" VARCHAR(100),
    "api_key_hash" VARCHAR(64),
    "durum" VARCHAR(20) DEFAULT 'Aktif',
    "plan_tipi" VARCHAR(50) DEFAULT 'Standart',
    "plan_bitis_tarihi" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
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
CREATE TABLE "appointments" (
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
CREATE TABLE "hasta_notlari" (
    "id" UUID NOT NULL,
    "hasta_id" UUID,
    "not_metni" TEXT NOT NULL,
    "tarih" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "tenant_id" UUID NOT NULL,

    CONSTRAINT "hasta_notlari_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "setting_key" VARCHAR(100) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "setting_value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("setting_key","tenant_id")
);

-- CreateTable
CREATE TABLE "conversation_states" (
    "conversation_id" VARCHAR(255) NOT NULL,
    "phone_number" VARCHAR(50) NOT NULL,
    "current_intent" VARCHAR(100),
    "current_stage" VARCHAR(100),
    "context_data" JSONB DEFAULT '{}',
    "retry_count" INTEGER DEFAULT 0,
    "tenant_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_states_pkey" PRIMARY KEY ("conversation_id","tenant_id")
);

-- CreateTable
CREATE TABLE "super_admins" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "ad_soyad" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_api_key_key" ON "tenants"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_api_key_hash_key" ON "tenants"("api_key_hash");

-- CreateIndex
CREATE INDEX "clients_tenant_id_idx" ON "clients"("tenant_id");

-- CreateIndex
CREATE INDEX "clients_tenant_id_telefon_idx" ON "clients"("tenant_id", "telefon");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_tarih_idx" ON "appointments"("tenant_id", "tarih");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_deleted_at_idx" ON "appointments"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "hasta_notlari_tenant_id_hasta_id_idx" ON "hasta_notlari"("tenant_id", "hasta_id");

-- CreateIndex
CREATE INDEX "conversation_states_phone_number_idx" ON "conversation_states"("phone_number");

-- CreateIndex
CREATE INDEX "conversation_states_tenant_id_idx" ON "conversation_states"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "super_admins_email_key" ON "super_admins"("email");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_hasta_id_fkey" FOREIGN KEY ("hasta_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasta_notlari" ADD CONSTRAINT "hasta_notlari_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hasta_notlari" ADD CONSTRAINT "hasta_notlari_hasta_id_fkey" FOREIGN KEY ("hasta_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
