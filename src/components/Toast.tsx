export default function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-[22px] left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#464646] text-[#EFEFEF] text-[13px] px-5 py-[10px] rounded-[30px] z-[1200] shadow-[0_4px_20px_rgba(0,0,0,0.4)] duration-300">
      {message}
    </div>
  );
}
