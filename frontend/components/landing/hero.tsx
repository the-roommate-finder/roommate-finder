import Image from "next/image";


export function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-ink pb-24 pt-16">
      {/* Background image */}
      <Image
        src="/heroimg.jpeg"
        alt=""
        fill
        priority
        className="object-cover"
      />
      {/* Overlay for text readability */}
      <div className="absolute inset-0 bg-brand-ink/70" />

      <div className="container relative">
        <div className="max-w-2xl">
          <h1 className="mt-6 text-4xl font-display leading-tight text-white sm:text-5xl">
            Your next roommate <br className="hidden sm:block" />
            <span className="text-brand-blue/70">won&apos;t be a nightmare.</span>
          </h1>

          <p className="mt-6 max-w-md text-lg text-white/70">
            The platform for room seekers and listers in Nigeria. Match
            compatible flatmates or find vetted tenants. Identity-verified.
            Zero agents. Zero scams.
          </p>
        </div>
      </div>
    </section>
  );
}
