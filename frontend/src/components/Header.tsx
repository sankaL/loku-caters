import Image from "next/image";

export default function Header() {
  return (
    <header className="w-full py-5 px-6">
      <div className="max-w-5xl mx-auto flex items-center gap-3">
        <Image
          src="/logo-color.svg"
          alt="Loku Caters leaf logo"
          width={40}
          height={40}
          className="rounded-xl"
        />
        <div>
          <span
            className="text-lg font-bold tracking-tight"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-forest)" }}
          >
            Loku Caters
          </span>
          <p className="text-xs tracking-widest uppercase" style={{ color: "var(--color-sage)", marginTop: "-2px" }}>
            Authentic Sri Lankan Cuisine
          </p>
        </div>
      </div>
    </header>
  );
}
