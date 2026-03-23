export interface ProjectNomosRuntimeContext {
  nomos_id: string;
  activation_status: 'active_builtin' | 'active_project';
  bootstrap_interview_prompt_path: string;
  closeout_review_prompt_path: string;
  doctor_project_prompt_path: string;
}

export interface ProjectNomosAuthoringPort {
  refineProjectNomosDraft(projectId: string): {
    draftDir: string;
    draftProfilePath: string;
  };
  resolveProjectNomosRuntimeContext?(projectId: string): ProjectNomosRuntimeContext;
}
