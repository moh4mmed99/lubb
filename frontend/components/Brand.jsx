// The brand is the name itself: لُبّ ("core"), Alexandria Black in one flat colour (it takes the text colour around it).

const sizes = { sm: "text-3xl", md: "text-5xl", lg: "text-[9rem] md:text-[13rem]" };

export function Wordmark({ size = "md" }) {
  return (
    <span className={`inline-block font-brand leading-[1.4] font-black ${sizes[size]}`} lang="ar" dir="rtl">
      لُبّ
    </span>
  );
}
