import type { RoleBindingDto, RoleBindingScopeDto, RoleDefinitionDto, TemplateDetailDto } from '@agora-ts/contracts';
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

  resolveTemplateTeam(
    templateId: string,
    template: TemplateDetailDto,
    scopes: Array<{ scope: RoleBindingScopeDto; scope_ref: string }>,
  ): Array<{
    role: string;
    agentId: string;
    member_kind?: 'controller' | 'citizen' | 'craftsman';
    model_preference: string;
    agent_origin?: 'agora_managed' | 'user_managed';
    briefing_mode?: 'overlay_full' | 'overlay_delta';
  }> {
    return Object.entries(template.defaultTeam ?? {}).map(([role, config]) => {
      const binding = this.resolveRoleTarget(role, [
        { scope: 'template', scope_ref: templateId },
        ...scopes,
      ]);
      const metadata = binding?.metadata && typeof binding.metadata === 'object'
        ? binding.metadata as Record<string, unknown>
        : null;
      const inferredOrigin = binding?.binding_mode === 'generated' ? 'agora_managed' : 'user_managed';
      const origin = metadata?.agent_origin === 'agora_managed' || metadata?.agent_origin === 'user_managed'
        ? metadata.agent_origin
        : inferredOrigin;
      const mode = metadata?.briefing_mode === 'overlay_delta' || metadata?.briefing_mode === 'overlay_full'
        ? metadata.briefing_mode
        : (origin === 'agora_managed' ? 'overlay_delta' : 'overlay_full');
      return {
        role,
        agentId: binding?.target_ref ?? config.suggested?.[0] ?? role,
        ...(config.member_kind ? { member_kind: config.member_kind } : {}),
        model_preference: config.model_preference ?? '',
        agent_origin: origin,
        briefing_mode: mode,
      };
    });
  }
}
