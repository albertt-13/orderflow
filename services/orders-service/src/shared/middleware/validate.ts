import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { BadRequestError } from "@orderflow/shared";

function validate<T>(schema: ZodType<T>, source: "body" | "query" | "params") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new BadRequestError(result.error.issues.map((issue) => issue.message).join(", ")));
      return;
    }
    if (source === "query") {
      req.validatedQuery = result.data;
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}

export const validateBody = <T>(schema: ZodType<T>) => validate(schema, "body");
export const validateParams = <T>(schema: ZodType<T>) => validate(schema, "params");
