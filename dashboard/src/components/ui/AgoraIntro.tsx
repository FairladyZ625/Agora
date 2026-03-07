export function AgoraIntro({
  active,
}: {
  active: boolean;
}) {
  if (!active) return null;

  return (
    <div className="agora-intro" aria-hidden="true">
      <div className="agora-intro__veil" />
      <div className="agora-intro__sigil">
        <span className="agora-intro__ring agora-intro__ring--outer" />
        <span className="agora-intro__ring agora-intro__ring--mid" />
        <span className="agora-intro__ring agora-intro__ring--inner" />
        <span className="agora-intro__core">AGORA</span>
      </div>
      <div className="agora-intro__copy">
        <p className="agora-intro__kicker">Operational Commons</p>
        <h1 className="agora-intro__title">Debate, decide, execute.</h1>
        <p className="agora-intro__detail">让群体判断先收束，再把执行推入秩序。</p>
      </div>
    </div>
  );
}
