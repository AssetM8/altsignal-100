import { FileUniverseProvider, buildEntities } from "@/lib/providers/universe";
import { EntityResolver } from "@/lib/nlp/entity-resolver";

let resolver: EntityResolver | null = null;
export async function getResolver(): Promise<EntityResolver> {
  if (!resolver) resolver = new EntityResolver(buildEntities(await new FileUniverseProvider().load()));
  return resolver;
}
export const tickersOf = (r: { mentions: { ticker: string }[] }) => r.mentions.map((m) => m.ticker).sort();
