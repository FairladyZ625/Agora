export interface ProjectNomosAuthoringPort {
  refineProjectNomosDraft(projectId: string): {
    draftDir: string;
    draftProfilePath: string;
  };
}
