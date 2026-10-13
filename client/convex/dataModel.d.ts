/* The backend is private, so the table documents are not published. Ids keep their table names. */
import type { GenericId } from "convex/values";
export type Id<TableName extends string> = GenericId<TableName>;
export type Doc<_TableName extends string> = Record<string, unknown> & { _id: string; _creationTime: number };
