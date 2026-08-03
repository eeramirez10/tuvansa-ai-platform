import { NextFunction, Request, Response } from "express";

export function internalApiKeyMiddleware(expectedKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const providedKey = req.header("x-internal-api-key");
    if (providedKey !== expectedKey) {
      res.status(401).json({ error: "Invalid internal API key.", code: "INVALID_INTERNAL_API_KEY" });
      return;
    }

    next();
  };
}
