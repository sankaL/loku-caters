import type { Metadata } from "next";

const DEFAULT_SITE_URL = "http://localhost:3000";
const OG_IMAGE_PATH = "/assets/food/multi-food6.jpg";
const BRAND_NAME = "Loku Caters";

export const SITE_URL = new URL(normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL));

type RouteKey = "home" | "menu" | "flyer" | "orders" | "cateringRequest" | "reviews";

const pageMetadata: Record<
  RouteKey,
  {
    title: string;
    description: string;
    path: string;
  }
> = {
  home: {
    title: "Loku Caters | Authentic Sri Lankan Cuisine",
    description:
      "Pre-order authentic Sri Lankan Lamprais, lovingly prepared and available for pickup. Limited quantities, reserve yours today.",
    path: "/",
  },
  menu: {
    title: "Catering Menu | Loku Caters",
    description:
      "Explore authentic Sri Lankan appetizers, classic curries, lamprais, desserts, and catering favorites from Loku Caters.",
    path: "/menu",
  },
  flyer: {
    title: "Catering Flyer | Loku Caters",
    description:
      "Browse current appetizer and tray offerings from Loku Caters, including rolls, pastries, patties, cutlets, curries, and more.",
    path: "/flyer",
  },
  orders: {
    title: "Order Sri Lankan Lamprais | Loku Caters",
    description:
      "Reserve authentic Sri Lankan Lamprais and event specials from Loku Caters for the current pop-up ordering window.",
    path: "/orders",
  },
  cateringRequest: {
    title: "Request Catering | Loku Caters",
    description:
      "Request custom Sri Lankan catering from Loku Caters for parties, family gatherings, corporate events, and special occasions.",
    path: "/catering-request",
  },
  reviews: {
    title: "Reviews | Loku Caters",
    description:
      "Read customer experiences with Loku Caters and share your feedback on our Sri Lankan catering and pop-up meals.",
    path: "/reviews",
  },
};

export function buildPageMetadata(routeKey: RouteKey): Metadata {
  const page = pageMetadata[routeKey];
  const canonicalUrl = buildAbsoluteUrl(page.path);
  const imageUrl = buildAbsoluteUrl(OG_IMAGE_PATH);

  return {
    title: {
      absolute: page.title,
    },
    description: page.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonicalUrl,
      siteName: BRAND_NAME,
      type: "website",
      images: [
        {
          url: imageUrl,
          width: 2048,
          height: 1365,
          alt: "Sri Lankan Lamprais and catering dishes from Loku Caters",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
      images: [imageUrl],
    },
  };
}

function buildAbsoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

function normalizeSiteUrl(rawValue: string | undefined): string {
  const value = rawValue?.trim() || DEFAULT_SITE_URL;
  return value.replace(/\/+$/, "");
}
