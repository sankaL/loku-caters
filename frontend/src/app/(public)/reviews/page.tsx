import { buildPageMetadata } from "@/config/metadata";
import ReviewsClient from "./ReviewsClient";

export const metadata = buildPageMetadata("reviews");

export default function ReviewsPage() {
  return <ReviewsClient />;
}
