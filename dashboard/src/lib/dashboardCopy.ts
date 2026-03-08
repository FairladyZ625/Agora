import { useTranslation } from 'react-i18next';

export function useShellCopy() {
  const { t } = useTranslation();

  return {
    brandName: t('shell.brandName'),
    workspaceLabel: t('shell.workspaceLabel'),
    footerTagline: t('shell.footerTagline'),
    footerVersion: t('shell.footerVersion'),
    railStatement: t('shell.railStatement'),
    railSummary: t('shell.railSummary'),
    navItems: [
      { to: '/', key: 'overview', label: t('shell.nav.overview.label'), hint: t('shell.nav.overview.hint') },
      { to: '/board', key: 'board', label: t('shell.nav.board.label'), hint: t('shell.nav.board.hint') },
      { to: '/tasks', key: 'tasks', label: t('shell.nav.tasks.label'), hint: t('shell.nav.tasks.hint') },
      { to: '/agents', key: 'agents', label: t('shell.nav.agents.label'), hint: t('shell.nav.agents.hint') },
      { to: '/todos', key: 'todos', label: t('shell.nav.todos.label'), hint: t('shell.nav.todos.hint') },
      { to: '/archive', key: 'archive', label: t('shell.nav.archive.label'), hint: t('shell.nav.archive.hint') },
      { to: '/templates', key: 'templates', label: t('shell.nav.templates.label'), hint: t('shell.nav.templates.hint') },
      { to: '/tasks/new', key: 'create', label: t('shell.nav.create.label'), hint: t('shell.nav.create.hint') },
      { to: '/reviews', key: 'reviews', label: t('shell.nav.reviews.label'), hint: t('shell.nav.reviews.hint') },
      { to: '/settings', key: 'settings', label: t('shell.nav.settings.label'), hint: t('shell.nav.settings.hint') },
    ],
  };
}

export function usePageMetaCopy() {
  const { t } = useTranslation();

  return {
    '/': { title: t('pageMeta.home.title') },
    '/board': { title: t('pageMeta.board.title') },
    '/tasks': { title: t('pageMeta.tasks.title') },
    '/agents': { title: t('pageMeta.agents.title') },
    '/todos': { title: t('pageMeta.todos.title') },
    '/archive': { title: t('pageMeta.archive.title') },
    '/templates': { title: t('pageMeta.templates.title') },
    '/tasks/new': { title: t('pageMeta.createTask.title') },
    '/reviews': { title: t('pageMeta.reviews.title') },
    '/settings': { title: t('pageMeta.settings.title') },
  } as const;
}

export function useDashboardHomeCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('home.kicker'),
    title: t('home.title'),
    summary: t('home.summary'),
    slogan: t('home.slogan'),
    primaryAction: t('home.primaryAction'),
    secondaryAction: t('home.secondaryAction'),
    syncErrorMessage: t('home.syncErrorMessage'),
    pulseKicker: t('home.pulseKicker'),
    pulseTitle: t('home.pulseTitle'),
    pulseStatusLoading: t('home.pulseStatusLoading'),
    pulseStatusReady: t('home.pulseStatusReady'),
    pulseOrbitLabels: {
      left: t('home.pulseOrbitLabels.left'),
      right: t('home.pulseOrbitLabels.right'),
      bottom: t('home.pulseOrbitLabels.bottom'),
    },
    pulseItemLabels: {
      running: t('home.pulseItems.running.label'),
      waiting: t('home.pulseItems.waiting.label'),
      latestCompleted: t('home.pulseItems.latestCompleted.label'),
    },
    sideNotes: [
      {
        kicker: t('home.sideNotes.brand.kicker'),
        title: t('home.sideNotes.brand.title'),
        body: t('home.sideNotes.brand.body'),
      },
      {
        kicker: t('home.sideNotes.promise.kicker'),
        title: t('home.sideNotes.promise.title'),
        body: t('home.sideNotes.promise.body'),
      },
    ],
    metricLabels: {
      active: t('home.metrics.activeLabel'),
      waiting: t('home.metrics.waitingLabel'),
      participants: t('home.metrics.participantsLabel'),
      latestCompleted: t('home.metrics.latestCompletedLabel'),
    },
    metricNotes: {
      active: t('home.metrics.activeNote'),
      waiting: t('home.metrics.waitingNote'),
      participants: t('home.metrics.participantsNote'),
      latestCompleted: t('home.metrics.latestCompletedNote'),
    },
    latestCompletedFallback: t('home.latestCompletedFallback'),
    feedKicker: t('home.feedKicker'),
    feedTitle: t('home.feedTitle'),
    feedAction: t('home.feedAction'),
    emptyTaskDescription: t('home.emptyTaskDescription'),
    fallbackDecisionStage: t('home.fallbackDecisionStage'),
    reviewKicker: t('home.reviewKicker'),
    reviewTitle: t('home.reviewTitle'),
    reviewCountUnit: t('home.reviewCountUnit'),
    reviewDescriptionPrefix: t('home.reviewDescriptionPrefix'),
    principleKicker: t('home.principleKicker'),
    principleTitle: t('home.principleTitle'),
    principleBullets: t('home.principleBullets', { returnObjects: true }) as string[],
  };
}

export function useBoardPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('board.kicker'),
    title: t('board.title'),
    summary: t('board.summary'),
    createAction: t('board.createAction'),
    emptyTitle: t('board.emptyTitle'),
    emptySummary: t('board.emptySummary'),
    columns: {
      pending: t('board.columns.pending'),
      inProgress: t('board.columns.inProgress'),
      gateWaiting: t('board.columns.gateWaiting'),
      completed: t('board.columns.completed'),
      interrupted: t('board.columns.interrupted'),
    },
  };
}

export function useCreateTaskPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('createTask.kicker'),
    title: t('createTask.title'),
    summary: t('createTask.summary'),
    titleLabel: t('createTask.titleLabel'),
    titlePlaceholder: t('createTask.titlePlaceholder'),
    descriptionLabel: t('createTask.descriptionLabel'),
    descriptionPlaceholder: t('createTask.descriptionPlaceholder'),
    typeLabel: t('createTask.typeLabel'),
    priorityLabel: t('createTask.priorityLabel'),
    submitAction: t('createTask.submitAction'),
    submittingAction: t('createTask.submittingAction'),
    backAction: t('createTask.backAction'),
    taskTypes: [
      { value: 'coding', label: t('createTask.taskType.coding') },
      { value: 'quick', label: t('createTask.taskType.quick') },
      { value: 'document', label: t('createTask.taskType.document') },
      { value: 'research', label: t('createTask.taskType.research') },
    ] as const,
  };
}

export function useTasksPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('tasks.kicker'),
    title: t('tasks.title'),
    summary: t('tasks.summary'),
    workbenchTitle: t('tasks.workbenchTitle'),
    workbenchSummary: t('tasks.workbenchSummary'),
    filterAction: t('tasks.filterAction'),
    clearFiltersAction: t('tasks.clearFiltersAction'),
    applyFiltersAction: t('tasks.applyFiltersAction'),
    detailAction: t('tasks.detailAction'),
    detailDialogLabel: t('tasks.detailDialogLabel'),
    detailDialogTitle: t('tasks.detailDialogTitle'),
    quickViewTitle: t('tasks.quickViewTitle'),
    filterSectionLabels: {
      state: t('tasks.filterSectionLabels.state'),
      priority: t('tasks.filterSectionLabels.priority'),
      team: t('tasks.filterSectionLabels.team'),
      workflow: t('tasks.filterSectionLabels.workflow'),
    },
    filterEmpty: t('tasks.filterEmpty'),
    activeFilterPrefix: t('tasks.activeFilterPrefix'),
    searchPlaceholder: t('tasks.searchPlaceholder'),
    listKicker: t('tasks.listKicker'),
    listTitle: t('tasks.listTitle'),
    listCountUnit: t('tasks.listCountUnit'),
    detailKicker: t('tasks.detailKicker'),
    stageLabel: t('tasks.stageLabel'),
    stageFallback: t('tasks.stageFallback'),
    workflowLabel: t('tasks.workflowLabel'),
    teamLabel: t('tasks.teamLabel'),
    updatedLabel: t('tasks.updatedLabel'),
    briefFallback: t('tasks.briefFallback'),
    timelineTitle: t('tasks.timelineTitle'),
    timelineEmptyDetail: t('tasks.timelineEmptyDetail'),
    progressTitle: t('tasks.progressTitle'),
    subtasksTitle: t('tasks.subtasksTitle'),
    subtaskFallbackType: t('tasks.subtaskFallbackType'),
    actionsTitle: t('tasks.actionsTitle'),
    actorLabel: t('tasks.actorLabel'),
    noteLabel: t('tasks.noteLabel'),
    notePlaceholder: t('tasks.notePlaceholder'),
    advanceAction: t('tasks.advanceAction'),
    approveAction: t('tasks.approveAction'),
    rejectAction: t('tasks.rejectAction'),
    confirmApproveAction: t('tasks.confirmApproveAction'),
    confirmRejectAction: t('tasks.confirmRejectAction'),
    pauseAction: t('tasks.pauseAction'),
    resumeAction: t('tasks.resumeAction'),
    cancelAction: t('tasks.cancelAction'),
    unblockAction: t('tasks.unblockAction'),
    forceAdvanceAction: t('tasks.forceAdvanceAction'),
    emptyTitle: t('tasks.emptyTitle'),
    emptySummary: t('tasks.emptySummary'),
    stats: {
      currentMatches: t('tasks.stats.currentMatches'),
      awaitingReview: t('tasks.stats.awaitingReview'),
      currentFocus: t('tasks.stats.currentFocus'),
    },
  };
}

export function useReviewsPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('reviews.kicker'),
    title: t('reviews.title'),
    summary: t('reviews.summary'),
    workbenchTitle: t('reviews.workbenchTitle'),
    workbenchSummary: t('reviews.workbenchSummary'),
    filterAction: t('reviews.filterAction'),
    clearFiltersAction: t('reviews.clearFiltersAction'),
    applyFiltersAction: t('reviews.applyFiltersAction'),
    detailAction: t('reviews.detailAction'),
    detailDialogLabel: t('reviews.detailDialogLabel'),
    detailDialogTitle: t('reviews.detailDialogTitle'),
    filterSectionLabels: {
      priority: t('reviews.filterSectionLabels.priority'),
      gate: t('reviews.filterSectionLabels.gate'),
      creator: t('reviews.filterSectionLabels.creator'),
    },
    activeFilterPrefix: t('reviews.activeFilterPrefix'),
    metricLabels: {
      queue: t('reviews.metricLabels.queue'),
      highestRisk: t('reviews.metricLabels.highestRisk'),
      defaultAction: t('reviews.metricLabels.defaultAction'),
    },
    metricValues: {
      highestRisk: t('reviews.metricValues.highestRisk'),
      normal: t('reviews.metricValues.normal'),
      defaultAction: t('reviews.metricValues.defaultAction'),
    },
    queueKicker: t('reviews.queueKicker'),
    queueTitle: t('reviews.queueTitle'),
    queueCountUnit: t('reviews.queueCountUnit'),
    queueFallbackSummary: t('reviews.queueFallbackSummary'),
    queueFallbackImpactPrefix: t('reviews.queueFallbackImpactPrefix'),
    queueFallbackImpactSuffix: t('reviews.queueFallbackImpactSuffix'),
    workspaceKicker: t('reviews.workspaceKicker'),
    workspaceTitle: t('reviews.workspaceTitle'),
    gateLabel: t('reviews.gateLabel'),
    impactLabel: t('reviews.impactLabel'),
    contextTitle: t('reviews.contextTitle'),
    progressTitle: t('reviews.progressTitle'),
    noteLabel: t('reviews.noteLabel'),
    notePlaceholder: t('reviews.notePlaceholder'),
    rejectAction: t('reviews.rejectAction'),
    approveAction: t('reviews.approveAction'),
    emptyTitle: t('reviews.emptyTitle'),
    emptySummary: t('reviews.emptySummary'),
    queueScopes: {
      high: t('reviews.queueScopes.high'),
    },
    tableHeaders: {
      task: t('reviews.tableHeaders.task'),
      gate: t('reviews.tableHeaders.gate'),
      priority: t('reviews.tableHeaders.priority'),
      wait: t('reviews.tableHeaders.wait'),
    },
    liveApiNotice: t('reviews.liveApiNotice'),
  };
}

export function useAgentsPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('agents.kicker'),
    title: t('agents.title'),
    summary: t('agents.summary'),
    metrics: {
      activeTasks: t('agents.metrics.activeTasks'),
      activeAgents: t('agents.metrics.activeAgents'),
      totalAgents: t('agents.metrics.totalAgents'),
      onlineAgents: t('agents.metrics.onlineAgents'),
      staleAgents: t('agents.metrics.staleAgents'),
      disconnectedAgents: t('agents.metrics.disconnectedAgents'),
      busyCraftsmen: t('agents.metrics.busyCraftsmen'),
    },
    providerSummaryTitle: t('agents.providerSummaryTitle'),
    providerDetailTitle: t('agents.providerDetailTitle'),
    providerTimelineTitle: t('agents.providerTimelineTitle'),
    providerSignalsTitle: t('agents.providerSignalsTitle'),
    tmuxRuntimeTitle: t('agents.tmuxRuntimeTitle'),
    filtersTitle: t('agents.filtersTitle'),
    filterLabels: {
      all: t('agents.filterLabels.all'),
      busy: t('agents.filterLabels.busy'),
      online: t('agents.filterLabels.online'),
      stale: t('agents.filterLabels.stale'),
      disconnected: t('agents.filterLabels.disconnected'),
      offline: t('agents.filterLabels.offline'),
    },
    agentListTitle: t('agents.agentListTitle'),
    craftsmenTitle: t('agents.craftsmenTitle'),
    emptyAgents: t('agents.emptyAgents'),
    emptyCraftsmen: t('agents.emptyCraftsmen'),
    roleLabel: t('agents.roleLabel'),
    sourceLabel: t('agents.sourceLabel'),
    modelLabel: t('agents.modelLabel'),
    presenceLabel: t('agents.presenceLabel'),
    presenceReasonLabel: t('agents.presenceReasonLabel'),
    providerLabel: t('agents.providerLabel'),
    accountLabel: t('agents.accountLabel'),
    statusLabel: t('agents.statusLabel'),
    lastSeenLabel: t('agents.lastSeenLabel'),
    loadLabel: t('agents.loadLabel'),
    taskCountLabel: t('agents.taskCountLabel'),
    subtaskCountLabel: t('agents.subtaskCountLabel'),
    currentTaskLabel: t('agents.currentTaskLabel'),
    readyLabel: t('agents.readyLabel'),
    paneLabel: t('agents.paneLabel'),
    commandLabel: t('agents.commandLabel'),
    tailPreviewLabel: t('agents.tailPreviewLabel'),
    continuityBackendLabel: t('agents.continuityBackendLabel'),
    resumeCapabilityLabel: t('agents.resumeCapabilityLabel'),
    sessionReferenceLabel: t('agents.sessionReferenceLabel'),
    identitySourceLabel: t('agents.identitySourceLabel'),
    identityPathLabel: t('agents.identityPathLabel'),
    observedAtLabel: t('agents.observedAtLabel'),
    recoveryModeLabel: t('agents.recoveryModeLabel'),
    emptyProviderDetail: t('agents.emptyProviderDetail'),
    emptyProviderHistory: t('agents.emptyProviderHistory'),
    emptyProviderSignals: t('agents.emptyProviderSignals'),
    emptyTmuxRuntime: t('agents.emptyTmuxRuntime'),
  };
}

export function useTodosPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('todos.kicker'),
    title: t('todos.title'),
    summary: t('todos.summary'),
    inputLabel: t('todos.inputLabel'),
    inputPlaceholder: t('todos.inputPlaceholder'),
    dueLabel: t('todos.dueLabel'),
    tagsLabel: t('todos.tagsLabel'),
    tagsPlaceholder: t('todos.tagsPlaceholder'),
    createAction: t('todos.createAction'),
    filters: {
      all: t('todos.filters.all'),
      pending: t('todos.filters.pending'),
      done: t('todos.filters.done'),
    },
    emptyTitle: t('todos.emptyTitle'),
    promoteAction: t('todos.promoteAction'),
    deleteAction: t('todos.deleteAction'),
    doneAction: t('todos.doneAction'),
    reopenAction: t('todos.reopenAction'),
    promotedPrefix: t('todos.promotedPrefix'),
  };
}

export function useArchivePageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('archive.kicker'),
    title: t('archive.title'),
    summary: t('archive.summary'),
    filters: {
      all: t('archive.filters.all'),
      pending: t('archive.filters.pending'),
      failed: t('archive.filters.failed'),
      completed: t('archive.filters.completed'),
    },
    taskIdLabel: t('archive.taskIdLabel'),
    detailTitle: t('archive.detailTitle'),
    emptyTitle: t('archive.emptyTitle'),
    payloadTitle: t('archive.payloadTitle'),
    retryAction: t('archive.retryAction'),
    requestedAtLabel: t('archive.requestedAtLabel'),
    completedAtLabel: t('archive.completedAtLabel'),
    targetPathLabel: t('archive.targetPathLabel'),
  };
}

export function useTemplatesPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('templates.kicker'),
    title: t('templates.title'),
    summary: t('templates.summary'),
    listTitle: t('templates.listTitle'),
    detailTitle: t('templates.detailTitle'),
    governanceLabel: t('templates.governanceLabel'),
    teamLabel: t('templates.teamLabel'),
    stagesTitle: t('templates.stagesTitle'),
    emptyTitle: t('templates.emptyTitle'),
  };
}

export function useSettingsPageCopy() {
  const { t } = useTranslation();

  return {
    kicker: t('settings.kicker'),
    title: t('settings.title'),
    summary: t('settings.summary'),
    gatewayKicker: t('settings.gatewayKicker'),
    gatewayTitle: t('settings.gatewayTitle'),
    endpointLabel: t('settings.endpointLabel'),
    tokenLabel: t('settings.tokenLabel'),
    tokenPlaceholder: t('settings.tokenPlaceholder'),
    tokenHideLabel: t('settings.tokenHideLabel'),
    tokenShowLabel: t('settings.tokenShowLabel'),
    refreshKicker: t('settings.refreshKicker'),
    refreshTitle: t('settings.refreshTitle'),
    refreshLabel: t('settings.refreshLabel'),
    pauseLabel: t('settings.pauseLabel'),
    appearanceKicker: t('settings.appearanceKicker'),
    appearanceTitle: t('settings.appearanceTitle'),
    appearanceDescriptions: {
      light: t('settings.appearanceDescriptions.light'),
      dark: t('settings.appearanceDescriptions.dark'),
      system: t('settings.appearanceDescriptions.system'),
    },
    appearanceLabels: {
      light: t('settings.appearanceLabels.light'),
      dark: t('settings.appearanceLabels.dark'),
      system: t('settings.appearanceLabels.system'),
    },
    languageKicker: t('settings.languageKicker'),
    languageTitle: t('settings.languageTitle'),
    saveAction: t('settings.saveAction'),
    testAction: t('settings.testAction'),
    cleanupAction: t('settings.cleanupAction'),
    cleanupSuccess: (count: number) => t('settings.cleanupSuccess', { count }),
    healthSuccess: t('settings.healthSuccess'),
    healthFailureFallback: t('settings.healthFailureFallback'),
    healthLoading: t('settings.healthLoading'),
  };
}
