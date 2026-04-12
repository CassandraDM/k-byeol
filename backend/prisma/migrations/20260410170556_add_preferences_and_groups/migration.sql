-- CreateTable
CREATE TABLE "kpop_groups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,

    CONSTRAINT "kpop_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "city_code" VARCHAR(10),
    "city_name" VARCHAR(255),
    "city_postal_code" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences_groups" (
    "preferences_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,

    CONSTRAINT "user_preferences_groups_pkey" PRIMARY KEY ("preferences_id","group_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kpop_groups_name_key" ON "kpop_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "kpop_groups_slug_key" ON "kpop_groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences_groups" ADD CONSTRAINT "user_preferences_groups_preferences_id_fkey" FOREIGN KEY ("preferences_id") REFERENCES "user_preferences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences_groups" ADD CONSTRAINT "user_preferences_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "kpop_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
