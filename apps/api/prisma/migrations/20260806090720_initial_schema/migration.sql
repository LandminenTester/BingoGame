-- CreateEnum
CREATE TYPE "TemplateVisibility" AS ENUM ('private', 'public', 'unlisted', 'predefined');

-- CreateEnum
CREATE TYPE "LobbyStatus" AS ENUM ('draft', 'open', 'running', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('individual', 'streamer_controlled');

-- CreateEnum
CREATE TYPE "WinningCondition" AS ENUM ('first_line', 'full_card');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('host', 'player');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "loginName" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoTemplate" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "name" TEXT NOT NULL,
    "description" VARCHAR(1000),
    "game" VARCHAR(100),
    "category" VARCHAR(100),
    "language" VARCHAR(12) NOT NULL DEFAULT 'de',
    "visibility" "TemplateVisibility" NOT NULL DEFAULT 'private',
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BingoTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BingoTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lobby" (
    "id" TEXT NOT NULL,
    "code" CHAR(6) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "hostId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "LobbyStatus" NOT NULL DEFAULT 'draft',
    "gameMode" "GameMode" NOT NULL,
    "winningCondition" "WinningCondition" NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 100,
    "passwordHash" TEXT,
    "allowLateJoin" BOOLEAN NOT NULL DEFAULT true,
    "lateJoinEligible" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lobby_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LobbyParticipant" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'player',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "LobbyParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCard" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCardField" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "templateFieldId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "confirmedByHost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlayerCardField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LobbyEvent" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "templateFieldId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoResult" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "completedFields" INTEGER NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "validated" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BingoResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(50) NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_twitchUserId_key" ON "User"("twitchUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BingoTemplateField_templateId_position_key" ON "BingoTemplateField"("templateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Lobby_code_key" ON "Lobby"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyParticipant_lobbyId_userId_key" ON "LobbyParticipant"("lobbyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCard_participantId_key" ON "PlayerCard"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCardField_cardId_position_key" ON "PlayerCardField"("cardId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCardField_cardId_templateFieldId_key" ON "PlayerCardField"("cardId", "templateFieldId");

-- CreateIndex
CREATE INDEX "LobbyEvent_lobbyId_templateFieldId_idx" ON "LobbyEvent"("lobbyId", "templateFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "BingoResult_participantId_key" ON "BingoResult"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "BingoResult_lobbyId_placement_key" ON "BingoResult"("lobbyId", "placement");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "BingoTemplate" ADD CONSTRAINT "BingoTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoTemplateField" ADD CONSTRAINT "BingoTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BingoTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lobby" ADD CONSTRAINT "Lobby_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BingoTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyParticipant" ADD CONSTRAINT "LobbyParticipant_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyParticipant" ADD CONSTRAINT "LobbyParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCard" ADD CONSTRAINT "PlayerCard_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LobbyParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCardField" ADD CONSTRAINT "PlayerCardField_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "PlayerCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyEvent" ADD CONSTRAINT "LobbyEvent_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoResult" ADD CONSTRAINT "BingoResult_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoResult" ADD CONSTRAINT "BingoResult_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "LobbyParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
