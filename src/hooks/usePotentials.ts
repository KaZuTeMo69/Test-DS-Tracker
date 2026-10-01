import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPotential,
  editPotential,
  importPotentialsCsv,
  importPotentialsJson,
  Potential,
  PotentialDraft,
  PotentialImport,
} from "../lib/potentials";
import { localPotentialRepository, migrateManualStores, PotentialRepository } from "../lib/potentialRepository";
import { draftsInSheet, loadPotentialsTab, SheetPotentials } from "../lib/sheetPotentials";

/** Where the sheet's Potentials come from: the store spreadsheet's last successful load, and its header row. */
export interface PotentialsSheetSource {
  sheetSync: { id: string; count: number }; // id "" when no sheet is linked
  storeHeaders: string[] | null;
}

/** Whether the linked spreadsheet has a Potentials tab: none linked, not known yet, found, or not there. */
export type PotentialsTab = "none" | "unknown" | "found" | "missing";

/**
 * The Potentials: the rows of the spreadsheet's Potentials tab (read-only here, edited in Google Sheets) and the
 * drafts added in the app, kept through their repository (this browser's storage). The tab is read after every
 * successful sheet load; a draft goes once a row of the tab has its ID. Without the tab there are only drafts.
 * The manual stores saved by earlier versions are moved in once, at start. `notify` shows a short message.
 */
export function usePotentials(
  notify: (msg: string) => void,
  source: PotentialsSheetSource | null = null,
  repo?: PotentialRepository,
) {
  // The move runs before the first read, so the moved entries are in the first list
  const [moved] = useState(() => (repo ? 0 : migrateManualStores()));
  const [repository] = useState(() => repo ?? localPotentialRepository());
  const [drafts, setDrafts] = useState<Potential[]>(() => repository.list());
  // The tab as last read, with the sheet it was read from (read is null when that sheet has no such tab)
  const [read, setRead] = useState<{ sheetId: string; tab: SheetPotentials | null } | null>(null);

  useEffect(() => {
    if (moved > 0)
      notify(
        `Moved ${moved} manually added ${moved === 1 ? "store" : "stores"} to Potentials (Study). They no longer count as stores`,
      );
  }, [moved, notify]);

  const refresh = useCallback(() => setDrafts(repository.list()), [repository]);

  // Drafts whose row is now in the tab go, with a word to say so
  const settle = useCallback(
    (tabList: Potential[]) => {
      const gone = draftsInSheet(repository.list(), tabList);
      if (!gone.length) return;
      for (const d of gone) repository.remove(d.id);
      refresh();
      notify(gone.length === 1 ? "1 draft is now in the sheet" : `${gone.length} drafts are now in the sheet`);
    },
    [repository, refresh, notify],
  );

  const sheetId = source?.sheetSync.id ?? "";
  const syncCount = source?.sheetSync.count ?? 0;
  const storeHeadersRef = useRef<string[] | null>(null);
  useEffect(() => {
    storeHeadersRef.current = source?.storeHeaders ?? null;
  });

  // Read the tab after every successful sheet load. A failed read keeps the last one; a read overtaken by a newer
  // one is dropped
  useEffect(() => {
    if (!sheetId) return;
    let current = true;
    loadPotentialsTab(sheetId, storeHeadersRef.current)
      .then((tab) => {
        if (!current) return;
        setRead({ sheetId, tab });
        if (tab) settle(tab.list);
      })
      .catch(() => {
        // Kept as it was; the next sync tries again
      });
    return () => {
      current = false;
    };
  }, [sheetId, syncCount, settle]);

  // Only what was read from the sheet linked now counts: unlinking it (or linking another) sets the tab aside
  const sheet = sheetId && read?.sheetId === sheetId ? read.tab : null;
  const tab: PotentialsTab = !sheetId ? "none" : read?.sheetId !== sheetId ? "unknown" : sheet ? "found" : "missing";
  const sheetList = useMemo(() => sheet?.list ?? [], [sheet]);

  const add = useCallback(
    (draft: PotentialDraft): Potential => {
      // A new ID is kept clear of the tab's too
      const p = createPotential(
        draft,
        [...repository.list(), ...sheetList].map((x) => x.id),
      );
      repository.add(p);
      refresh();
      return p;
    },
    [repository, refresh, sheetList],
  );

  // Only drafts can be changed here; a Potential from the tab is edited in Google Sheets
  const update = useCallback(
    (id: string, patch: Partial<PotentialDraft>): Potential | null => {
      const old = repository.list().find((p) => p.id === id);
      if (!old) return null;
      const next = editPotential(old, patch);
      repository.update(next);
      refresh();
      return next;
    },
    [repository, refresh],
  );

  // A whole draft as it should be (a status change made with withStatus, say)
  const replace = useCallback(
    (p: Potential) => {
      repository.update(p);
      refresh();
    },
    [repository, refresh],
  );

  const remove = useCallback(
    (id: string) => {
      repository.remove(id);
      refresh();
    },
    [repository, refresh],
  );

  /** Merges a CSV or JSON file into the drafts by ID; throws with a message when the file can't be read. */
  const importFile = useCallback(
    (text: string): PotentialImport => {
      const existing = repository.list();
      const result = /^\s*[[{]/.test(text) ? importPotentialsJson(text, existing) : importPotentialsCsv(text, existing);
      const before = new Set(existing.map((p) => p.id));
      for (const p of result.list) {
        if (before.has(p.id)) repository.update(p);
        else repository.add(p);
      }
      refresh();
      settle(sheetList);
      return result;
    },
    [repository, refresh, settle, sheetList],
  );

  // The tab's rows first, in its order, then the drafts not in it yet
  const { list, openDrafts, draftIds } = useMemo(() => {
    const inSheet = new Set(sheetList.map((p) => p.id));
    const open = drafts.filter((d) => !inSheet.has(d.id));
    return { list: [...sheetList, ...open], openDrafts: open, draftIds: new Set(open.map((p) => p.id)) };
  }, [sheetList, drafts]);

  return useMemo(
    () => ({
      list, // everything: the tab's rows and the drafts
      drafts: openDrafts,
      draftIds,
      // The tab: whether it's there, its header row (a copied row follows it) and the problems in its rows
      tab,
      tabHeaders: sheet?.headers ?? null,
      tabIssues: sheet?.issues ?? [],
      add,
      update,
      replace,
      remove,
      importFile,
    }),
    [list, openDrafts, draftIds, tab, sheet, add, update, replace, remove, importFile],
  );
}

export type PotentialsState = ReturnType<typeof usePotentials>;
