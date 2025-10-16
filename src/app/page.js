import Link from "next/link";

export default function Home() {
  return (
    <div>
      <Link href="/01cardcpt">
      <div className="text-2xl font-bold">Card CPT</div>
      </Link>
      <Link href="/02stroop">
      <div className="text-2xl font-bold">Stroop</div>
      </Link>
      <Link href="/03freespeech">
      <div className="text-2xl font-bold">Free Speech</div>
      </Link>
      <Link href="/04numbersense">
      <div className="text-2xl font-bold">Number Sense</div>
      </Link>
    </div>
  );
}
