export interface ProjectNomosRuntimeContext {
  nomos_id: string;
  activation_status: 'active_builtin' | 'active_project';
  bootstrap_interview_prompt_path: string;
  closeout_review_prompt_path: string;
  doctor_project_prompt_path: string;
}

export interface ProjectNomosAuthoringPort {
  /**
   * Rebuilds the project-specific Nomos draft from the current authoring spec.
   *
   * Throws when the authoring spec is invalid or when the underlying Nomos
   * template/pack scaffold cannot be resolved.
   */
  refineProjectNomosDraft(projectId: string): {
    draftDir: string;
    draftProfilePath: string;
  };

  /**
   * Returns the currently effective runtime context when the adapter can resolve
   * active Nomos paths for the project. Callers must tolerate `undefined`.
   */
  resolveProjectNomosRuntimeContext?(projectId: string): ProjectNomosRuntimeContext | undefined;
}
