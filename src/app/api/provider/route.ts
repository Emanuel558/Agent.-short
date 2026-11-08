import { providerInfo } from "@/lib/providers/text";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export const GET = () => json(providerInfo());
