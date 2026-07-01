import FlyerClient from "./FlyerClient";
import { buildPageMetadata } from "@/config/metadata";

export const metadata = buildPageMetadata("flyer");

export default function FlyerPage() {
    return <FlyerClient />;
}
