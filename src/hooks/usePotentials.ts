import { useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * The Potentials, through their repository (this browser's storage for now). The manual stores saved by earlier
 * versions are moved in once, at start. `notify` shows a short message.
 */
export function usePotentials(notify: (msg: string) => void, repo?: PotentialRepository) {
  // The move runs before the first read, so the moved entries are in the first list
  const [moved] = useState(() => (repo ? 0 : migrateManualStores()));
  const [repository] = useState(() => repo ?? localPotentialRepository());
  const [list, setList] = useState<Potential[]>(() => repository.list());

  useEffect(() => {
    if (moved > 0)
      notify(
        `Moved ${moved} manually added ${moved === 1 ? "store" : "stores"} to Potentials (Study). They no longer count as stores`,
      );
  }, [moved, notify]);

  const refresh = useCallback(() => setList(repository.list()), [repository]);

  const add = useCallback(
    (draft: PotentialDraft): Potential => {
      const p = createPotential(
        draft,
        repository.list().map((x) => x.id),
      );
      repository.add(p);
      refresh();
      return p;
    },
    [repository, refresh],
  );

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

  // A whole Potential as it should be (a status change made with withStatus, say)
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

  /** Merges a CSV or JSON file in by ID; throws with a message when the file can't be read. */
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
      return result;
    },
    [repository, refresh],
  );

  return useMemo(
    () => ({ list, add, update, replace, remove, importFile }),
    [list, add, update, replace, remove, importFile],
  );
}

export type PotentialsState = ReturnType<typeof usePotentials>;
