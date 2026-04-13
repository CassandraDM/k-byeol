-- CreateTable
CREATE TABLE "group_requests" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "group_requests" ADD CONSTRAINT "group_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
