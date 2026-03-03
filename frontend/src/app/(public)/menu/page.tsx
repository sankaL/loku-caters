import MenuClient from "./MenuClient";

export const metadata = {
    title: "Catering Menu | Loku Caters",
    description: "Explore our rich selection of authentic Sri Lankan appetizers, classic curries, lamprais, and desserts.",
};

export default async function MenuPage() {
    return <MenuClient />;
}
