import {Component, type ReactNode} from 'react';

/** Keep navigation mounted when an optional chunk fails. Reload is explicit:
 * a rejected React.lazy promise is not presented as an in-place retry.
 */
export class SectionBoundary extends Component<{locale: 'ru' | 'en'; children: ReactNode; errorFallback?: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.errorFallback !== undefined) return this.props.errorFallback;
    const en=this.props.locale==='en';
    return <section className="panel" role="alert">
      <h2>{en?'Could not load this section':'Не удалось загрузить раздел'}</h2>
      <p>{en?'Use the menu to open another section, or reload the Mini App.':'Откройте другой раздел через меню или перезагрузите Mini App.'}</p>
      <button type="button" className="button secondary" onClick={()=>window.location.reload()}>{en?'Reload Mini App':'Перезагрузить Mini App'}</button>
    </section>;
  }
}
