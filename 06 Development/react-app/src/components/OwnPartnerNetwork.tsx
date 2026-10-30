import type {PartnerNetwork} from '../api/types';

const words: Record<string, {level: string; previous: string; next: string; limited: string}> = {
  ru: {level: 'Уровень', previous: 'Назад', next: 'Далее', limited: 'Показана часть сети'},
  en: {level: 'Level', previous: 'Previous', next: 'Next', limited: 'Part of the network is shown'},
  de: {level: 'Ebene', previous: 'Zurück', next: 'Weiter', limited: 'Ein Teil des Netzwerks wird angezeigt'},
  fr: {level: 'Niveau', previous: 'Précédent', next: 'Suivant', limited: 'Une partie du réseau est affichée'},
  es: {level: 'Nivel', previous: 'Anterior', next: 'Siguiente', limited: 'Se muestra una parte de la red'},
  pt: {level: 'Nível', previous: 'Anterior', next: 'Seguinte', limited: 'É apresentada uma parte da rede'},
  zh: {level: '层级', previous: '上一页', next: '下一页', limited: '仅显示部分网络'},
  ja: {level: '階層', previous: '前へ', next: '次へ', limited: 'ネットワークの一部を表示しています'},
  hi: {level: 'स्तर', previous: 'पिछला', next: 'अगला', limited: 'नेटवर्क का एक हिस्सा दिखाया गया है'},
  ar: {level: 'المستوى', previous: 'السابق', next: 'التالي', limited: 'يتم عرض جزء من الشبكة'},
};

/** Only the server's anonymous own-branch projection; never the admin graph. */
export function OwnPartnerNetwork({network, locale, title, loading, error, onPage}: {
  network: PartnerNetwork; locale: string; title: string; loading: boolean;
  error: string; onPage?: (offset: number) => void;
}) {
  const copy = words[locale] ?? words.en;
  return <section className="profile-card" aria-label={title} aria-busy={loading}>
    <h2>{title}</h2>
    <ul aria-live="polite">
      {network.nodes.map(node => <li key={node.label}>
        <span>{node.label} · {copy.level} {node.level}</span>
        {node.created_at && Number.isFinite(Date.parse(node.created_at)) && <>
          {' · '}<time dateTime={node.created_at}>{new Intl.DateTimeFormat(locale).format(new Date(node.created_at))}</time>
        </>}
      </li>)}
    </ul>
    {(network.depth_limited || network.page_limited) && <p role="status">{copy.limited}</p>}
    {onPage && <div className="button-row">
      <button type="button" className="button secondary" disabled={loading || network.offset === 0}
        onClick={() => onPage(Math.max(0, network.offset - network.limit))}>{copy.previous}</button>
      <button type="button" className="button secondary" disabled={loading || network.next_offset === null}
        onClick={() => {if (network.next_offset !== null) onPage(network.next_offset);}}>{copy.next}</button>
    </div>}
    {error && <p role="status">{error}</p>}
  </section>;
}
