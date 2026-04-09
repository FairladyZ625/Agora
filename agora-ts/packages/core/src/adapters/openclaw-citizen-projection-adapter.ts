import type { CitizenProjectionPreviewDto } from '@agora-ts/contracts';
import type { CitizenProjectionPort } from '../citizen-projection-port.js';
import { renderMarkdownFrontmatter } from '../markdown-frontmatter.js';

function toMarkdownSection(title: string, lines: string[]) {
  return [`## ${title}`, ...lines, ''].join('\n');
}

export class OpenClawCitizenProjectionAdapter implements CitizenProjectionPort {
  readonly adapter = 'openclaw';

  renderPreview(input: Parameters<CitizenProjectionPort['renderPreview']>[0]): CitizenProjectionPreviewDto {
    const scaffold = input.roleDefinition.citizen_scaffold;
    const profile = {
      citizen_id: input.citizen.citizen_id,
      display_name: input.citizen.display_name,
      project_id: input.project.id,
      project_name: input.project.name,
      role_id: input.citizen.role_id,
      status: input.citizen.status,
      persona: input.citizen.persona,
      boundaries: input.citizen.boundaries,
      skills_ref: input.citizen.skills_ref,
      channel_policies: input.citizen.channel_policies,
      runtime_projection: input.citizen.runtime_projection,
    };
    const scaffoldMarkdown = [
      renderMarkdownFrontmatter({
        doc_type: 'citizen_scaffold',
        project_id: input.project.id,
        citizen_id: input.citizen.citizen_id,
        role_id: input.citizen.role_id,
        adapter: input.citizen.runtime_projection.adapter,
        title: input.citizen.display_name,
        created_at: input.citizen.created_at,
        updated_at: input.citizen.updated_at,
      }),
      `# ${input.citizen.display_name}`,
      '',
      `- citizen_id: \`${input.citizen.citizen_id}\``,
      `- project: \`${input.project.id}\` (${input.project.name})`,
      `- role: \`${input.citizen.role_id}\``,
      `- adapter: \`${input.citizen.runtime_projection.adapter}\``,
      '',
      ...(input.citizen.persona ? ['## Persona', input.citizen.persona, ''] : []),
      toMarkdownSection('Boundaries', input.citizen.boundaries.length > 0 ? input.citizen.boundaries.map((line) => `- ${line}`) : ['- None']),
      toMarkdownSection('Skills', input.citizen.skills_ref.length > 0 ? input.citizen.skills_ref.map((line) => `- ${line}`) : ['- None']),
      ...(scaffold ? [
        toMarkdownSection('Soul', [scaffold.soul]),
        toMarkdownSection('Heartbeat', scaffold.heartbeat.map((line) => `- ${line}`)),
        toMarkdownSection('Recap Expectations', scaffold.recap_expectations.map((line) => `- ${line}`)),
      ] : []),
    ].join('\n').trimEnd() + '\n';

    return {
      citizen_id: input.citizen.citizen_id,
      adapter: this.adapter,
      summary: `OpenClaw preview for ${input.citizen.display_name} in project ${input.project.id}`,
      files: [
        {
          path: `.openclaw/citizens/${input.citizen.citizen_id}/profile.json`,
          content: `${JSON.stringify(profile, null, 2)}\n`,
        },
        {
          path: `.openclaw/citizens/${input.citizen.citizen_id}/brain/03-citizen-scaffold.md`,
          content: scaffoldMarkdown,
        },
      ],
      metadata: {
        project_id: input.project.id,
        role_id: input.citizen.role_id,
        auto_provision: input.citizen.runtime_projection.auto_provision,
      },
    };
  }
}
