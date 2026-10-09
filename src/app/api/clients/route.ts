import { makeCrudHandlers } from "@/lib/crud-api";

const handlers = makeCrudHandlers("client", { periodScoped: false });

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
