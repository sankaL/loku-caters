"use client";

import Link from "next/link";

export default function NoEventPage() {
  return (
    <section className="flex min-h-[32rem] items-center px-6 py-16 md:py-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="mb-7 animate-fade-up">
          <svg
            width="72"
            height="72"
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M36 62C36 62 36 38 36 28"
              stroke="var(--color-sage)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M36 42C28 36 14 34 12 22C24 18 36 28 36 42Z"
              fill="var(--color-sage)"
              opacity="0.85"
            />
            <path
              d="M36 42C44 36 58 34 60 22C48 18 36 28 36 42Z"
              fill="var(--color-sage)"
              opacity="0.65"
            />
            <path
              d="M36 28C30 22 20 20 18 12C28 10 36 20 36 28Z"
              fill="var(--color-sage)"
              opacity="0.75"
            />
            <path
              d="M36 28C42 22 52 20 54 12C44 10 36 20 36 28Z"
              fill="var(--color-sage)"
              opacity="0.55"
            />
            <path
              d="M36 28C33 18 34 10 36 8C38 10 39 18 36 28Z"
              fill="var(--color-sage)"
              opacity="0.9"
            />
          </svg>
        </div>

        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-[color:var(--color-sage)] animate-fade-up delay-100">
          Loku Caters
        </p>

        <h1
          className="mb-5 text-3xl font-bold leading-tight text-[color:var(--color-forest)] animate-fade-up delay-100 md:text-5xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          No events at this moment!
        </h1>

        <div className="mb-5 h-0.5 w-10 rounded-full bg-[color:var(--color-sage)]/40 animate-fade-up delay-200" />

        <p className="mb-9 max-w-md text-base leading-7 text-[color:var(--color-muted)] animate-fade-up delay-200">
          Our next batch of Loku Caters is still taking shape. We will share it
          the moment it is ready. In the meantime, we are always happy to hear
          from you.
        </p>

        <div className="mb-6 flex flex-col items-center gap-3 animate-fade-up delay-300">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[color:var(--color-forest)] px-8 py-3.5 text-sm font-semibold text-[color:var(--color-cream)] transition-colors hover:bg-[color:var(--color-sage)] sm:w-[12rem]"
            >
              Get in Touch
            </Link>
            <Link
              href="/catering-request"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-[#8B5E3C] px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#744d30] sm:w-[12rem]"
            >
              Request Catering
            </Link>
          </div>
          <a
            href="tel:+16478301812"
            className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--color-muted)] transition-colors hover:text-[color:var(--color-forest)]"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            +1 (647) 830-1812
          </a>
        </div>

        <p className="max-w-sm text-sm font-medium leading-6 text-[color:var(--color-text)] animate-fade-up delay-300">
          Have a past order question or a catering request? We would love to
          help.
        </p>
      </div>
    </section>
  );
}
