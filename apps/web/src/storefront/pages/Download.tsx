import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Notice, PageHeading } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';

/**
 * Staff page for installing the Windows POS app on a new terminal. The link
 * and version come from the server (DESKTOP_DOWNLOAD_URL / DESKTOP_VERSION),
 * so a new installer can be published without rebuilding the website.
 */
export function DownloadPage(): ReactElement {
  const { t } = useI18n();
  const release = useQuery({
    queryKey: ['desktop-release'],
    queryFn: () => api.desktopRelease(),
    staleTime: 300_000,
  });
  const data = release.data;

  return (
    <div className="page pb-16">
      <PageHeading title={t('download.title')} lead={t('download.lead')} />

      <section className="max-w-2xl space-y-6">
        <div className="rounded-2xl border border-line p-5">
          {release.isLoading ? (
            <div className="skeleton h-12 w-64" />
          ) : data?.available && data.url ? (
            <div className="space-y-3">
              <a href={data.url} className="btn-primary inline-flex h-12 px-6 text-base" rel="noopener" download>
                {t('download.button')}
              </a>
              <p className="text-sm text-cream-dim">
                {data.version ? t('download.version', { version: data.version }) : null}
                {data.version ? ' · ' : null}
                {t('download.requirements')}
              </p>
              {data.sha256 ? (
                <p className="break-all text-xs text-cream-faint" dir="ltr">
                  SHA-256: {data.sha256}
                </p>
              ) : null}
            </div>
          ) : (
            <Notice tone="info">{t('download.unavailable')}</Notice>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('download.stepsTitle')}</h2>
          <ol className="list-decimal space-y-2 ps-5 text-cream-dim">
            <li>{t('download.step1')}</li>
            <li>{t('download.step2')}</li>
            <li>{t('download.step3')}</li>
            <li>{t('download.step4')}</li>
          </ol>
        </div>

        <Notice tone="info">{t('download.smartscreen')}</Notice>

        <p className="text-sm text-cream-dim">
          {t('download.browserAlternative')}{' '}
          <Link to="/dashboard" className="underline">
            {t('download.openDashboard')}
          </Link>
        </p>
      </section>
    </div>
  );
}
