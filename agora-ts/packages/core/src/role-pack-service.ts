import type { RoleBindingDto, RoleBindingScopeDto, RoleDefinitionDto } from '@agora-ts/contracts';
import { RoleBindingRepository, RoleDefinitionRepository, type AgoraDatabase } from '@agora-ts/db';

export interface RolePackServiceOptions {
  db: AgoraDatabase;
  rolePacksDir?: string | null;
}

export class RolePackService {
  private readonly roleDefinitions: RoleDefinitionRepository;
  private readonly roleBindings: RoleBindingRepository;

  constructor(private readonly options: RolePackServiceOptions) {
    this.roleDefinitions = new RoleDefinitionRepository(options.db);
    this.roleBindings = new RoleBindingRepository(options.db);
    if (options.rolePacksDir) {
      this.roleDefinitions.seedFromPackDir(options.rolePacksDir);
    }
  }

  listRoleDefinitions(): ReturnType<RoleDefinitionRepository['listRoleDefinitions']> {
    return this.roleDefinitions.listRoleDefinitions();
  }

  getRoleDefinition(roleId: string): ReturnType<RoleDefinitionRepository['getRoleDefinition']> {
    return this.roleDefinitions.getRoleDefinition(roleId);
  }

  saveBinding(input: {
    id: string;
    role_id: string;
    scope: RoleBindingScopeDto;
    scope_ref: string;
    target_kind: RoleBindingDto['target_kind'];
    target_adapter: string;
    target_ref: string;
    binding_mode: RoleBindingDto['binding_mode'];
    metadata?: Record<string, unknown> | null;
  }): RoleBindingDto {
    return this.roleBindings.saveBinding(input);
  }

  listBindingsByScope(scope: RoleBindingScopeDto, scopeRef: string): RoleBindingDto[] {
    return this.roleBindings.listBindingsByScope(scope, scopeRef);
  }

  resolveRoleTarget(roleId: string, scopes: Array<{ scope: RoleBindingScopeDto; scope_ref: string }>): RoleBindingDto | null {
    for (const candidate of scopes) {
      const binding = this.roleBindings.getBinding(candidate.scope, candidate.scope_ref, roleId);
      if (binding) {
        return binding;
      }
    }
    return null;
  }

  toRoleSeed(definition: RoleDefinitionDto): RoleDefinitionDto {
    return definition;
  }
}
