-- AddForeignKey
ALTER TABLE "PlayerCardField" ADD CONSTRAINT "PlayerCardField_templateFieldId_fkey" FOREIGN KEY ("templateFieldId") REFERENCES "BingoTemplateField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
