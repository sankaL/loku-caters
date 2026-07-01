import { buildPageMetadata } from "@/config/metadata";
import CateringRequestClient from "./CateringRequestClient";

export const metadata = buildPageMetadata("cateringRequest");

export default function CateringRequestPage() {
  return <CateringRequestClient />;
}
