import { z } from "zod";
import { leadStatuses } from "./labels";

export const statusSchema = z.enum(Object.keys(leadStatuses) as [keyof typeof leadStatuses], "Estatus no válido");
export const notesSchema = z.object({ notes: z.string().trim().max(4000, "Máximo 4000 caracteres").transform((v) => v || null) });

export const bulkSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("status"), status: statusSchema }),
  z.object({ op: z.literal("archive") }),
  z.object({ op: z.literal("unarchive") }),
  z.object({ op: z.literal("delete") }),
], "Acción no válida").and(z.object({ ids: z.array(z.uuid("Selección no válida")).min(1, "Selecciona al menos un prospecto").max(500, "Máximo 500 a la vez") }));
