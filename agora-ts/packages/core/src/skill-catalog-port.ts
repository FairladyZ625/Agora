export interface SkillCatalogEntry {
  skill_ref: string;
  relative_path: string;
  resolved_path: string;
  source_root: string;
  source_label: string;
  precedence: number;
  mtime: string | null;
  shadowed_paths: string[];
}

export interface ListSkillsInput {
  refresh?: boolean;
}

export interface SkillCatalogPort {
  listSkills(input?: ListSkillsInput): SkillCatalogEntry[];
}
