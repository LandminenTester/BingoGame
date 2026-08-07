-- AlterTable: add game column to BingoTemplate
ALTER TABLE "BingoTemplate" ADD COLUMN "game" VARCHAR(100);

-- CreateTable: TemplateVote
CREATE TABLE "TemplateVote" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: LobbyRound
CREATE TABLE "LobbyRound" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVote_templateId_userId_key" ON "TemplateVote"("templateId", "userId");

-- AddForeignKey
ALTER TABLE "TemplateVote" ADD CONSTRAINT "TemplateVote_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BingoTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVote" ADD CONSTRAINT "TemplateVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyRound" ADD CONSTRAINT "LobbyRound_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;
