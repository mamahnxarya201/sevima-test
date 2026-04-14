'use client';

type ListPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

function compactPages(totalPages: number, currentPage: number): number[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  return Array.from(pages).filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
}

export function ListPagination({ page, pageSize, total, onPageChange }: ListPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages = compactPages(totalPages, page);

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-lg bg-[#edefe8] px-3 py-1.5 text-[12px] font-semibold text-[#2f342e] ring-1 ring-[#afb3ac]/15 disabled:opacity-40"
      >
        Prev
      </button>

      {pages.map((p, idx) => {
        const prev = pages[idx - 1];
        const gap = prev != null && p - prev > 1;
        return (
          <span key={p} className="contents">
            {gap ? <span className="px-1 text-[#afb3ac]">…</span> : null}
            <button
              type="button"
              onClick={() => onPageChange(p)}
              className={`h-8 min-w-8 rounded-lg px-2 text-[12px] font-semibold ring-1 ring-[#afb3ac]/15 ${
                p === page ? 'bg-[#3a6095] text-white' : 'bg-white text-[#2f342e]'
              }`}
            >
              {p}
            </button>
          </span>
        );
      })}

      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-lg bg-[#edefe8] px-3 py-1.5 text-[12px] font-semibold text-[#2f342e] ring-1 ring-[#afb3ac]/15 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
