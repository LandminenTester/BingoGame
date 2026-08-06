-- DropForeignKey
ALTER TABLE "LobbyParticipant" DROP CONSTRAINT "LobbyParticipant_userId_fkey";

-- AlterTable
ALTER TABLE "Lobby" ADD COLUMN     "allowGuests" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LobbyParticipant" ADD COLUMN     "guestName" VARCHAR(60),
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GuestToken" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestToken_participantId_key" ON "GuestToken"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "GuestToken_tokenHash_key" ON "GuestToken"("tokenHash");

-- CreateIndex
CREATE INDEX "GuestToken_expiresAt_idx" ON "GuestToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "LobbyParticipant" ADD CONSTRAINT "LobbyParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestToken" ADD CONSTRAINT "GuestToken_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LobbyParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
