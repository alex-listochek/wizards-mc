import { server } from '../config.js';
import { copy } from '../lib/copy.js';
import { Link } from '../lib/router.jsx';
import { CopyIcon } from './Icons.jsx';

function CopyField({ value, label, message }) {
  return (
    <button className="copy-field" onClick={() => copy(value, message)} title="Нажмите, чтобы скопировать">
      {label && <span className="copy-field-label">{label}</span>}
      <span className="mono">{value}</span>
      <CopyIcon />
    </button>
  );
}

// Адреса для входа: плитки Java и Bedrock. Используется на главной и в кнопке «IP».
export default function Connect({ onHelp }) {
  return (
    <div className="connect">
      {server.addresses.map((a) => (
        <div className="connect-tile" key={a.edition}>
          <div className="connect-head">
            <span className="connect-edition">{a.edition}</span>
            {a.versions && <span className="connect-versions">{a.versions}</span>}
          </div>
          <div className="connect-values">
            <CopyField value={a.address} message={`Адрес ${a.edition} скопирован`} />
            {a.port && <CopyField value={a.port} label="порт" message="Порт скопирован" />}
          </div>
        </div>
      ))}
      {server.helpArticle && (
        <Link to={server.helpArticle} className="connect-help" onClick={onHelp}>
          Не удаётся зайти на сервер?
        </Link>
      )}
    </div>
  );
}
