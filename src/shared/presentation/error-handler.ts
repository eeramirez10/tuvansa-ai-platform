import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../domain/app-error";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  if (error instanceof multer.MulterError) {
    const fileTooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(fileTooLarge ? 413 : 400).json({
      error: fileTooLarge ? "File exceeds the configured size limit." : error.message,
      code: fileTooLarge ? "FILE_TOO_LARGE" : "INVALID_MULTIPART_REQUEST",
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected error.";
  console.error(JSON.stringify({ level: "error", message }));
  res.status(500).json({ error: "Unexpected AI platform error.", code: "UNEXPECTED_ERROR" });
}
