-- AlterTable
ALTER TABLE "BingoTemplate" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TemplateFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovedPublisher" (
    "id" TEXT NOT NULL,
    "loginName" VARCHAR(64) NOT NULL,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovedPublisher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateFavorite_userId_templateId_key" ON "TemplateFavorite"("userId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovedPublisher_loginName_key" ON "ApprovedPublisher"("loginName");

-- AddForeignKey
ALTER TABLE "TemplateFavorite" ADD CONSTRAINT "TemplateFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateFavorite" ADD CONSTRAINT "TemplateFavorite_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BingoTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
