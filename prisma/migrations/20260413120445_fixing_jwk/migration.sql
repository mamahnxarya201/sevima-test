/*
  Warnings:

  - You are about to drop the column `key` on the `jwks` table. All the data in the column will be lost.
  - Added the required column `privateKey` to the `jwks` table without a default value. This is not possible if the table is not empty.
  - Added the required column `publicKey` to the `jwks` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "jwks" DROP COLUMN "key",
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "privateKey" TEXT NOT NULL,
ADD COLUMN     "publicKey" TEXT NOT NULL;
