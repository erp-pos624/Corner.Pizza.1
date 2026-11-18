import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  ImageIcon,
  Loader2,
  RotateCcw,
  Save,
  Sparkles,
  Store,
  Upload,
  X,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  DEFAULT_STOREFRONT_CONTENT,
  type StorefrontContent,
  type StorefrontLine,
} from '@posshope/shared';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ErrorState } from '../components/ui/states';
import { toast } from '../components/ui/toast';
import { useI18n, type TranslationKey } from '../i18n';
import { api } from '../lib/api';
import { prepareImageUpload, resolveImageUrl } from '../lib/images';

const HEADLINE_MAX = 160;
const BODY_MAX = 900;
const CTA_MAX = 60;

function LineField({
  id,
  label,
  value,
  onChange,
  multiline = false,
  maxLength = HEADLINE_MAX,
  hint,
}: {
  id: string;
  label: string;
  value: StorefrontLine;
  onChange: (value: StorefrontLine) => void;
  multiline?: boolean;
  maxLength?: number;
  hint?: string;
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-en`}>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {multiline ? (
          <Textarea
            id={`${id}-en`}
            value={value.en}
            onChange={(event) => onChange({ ...value, en: event.target.value })}
            maxLength={maxLength}
            rows={3}
            dir="ltr"
          />
        ) : (
          <Input
            id={`${id}-en`}
            value={value.en}
            onChange={(event) => onChange({ ...value, en: event.target.value })}
            maxLength={maxLength}
            dir="ltr"
          />
        )}
        {multiline ? (
          <Textarea
            id={`${id}-ar`}
            value={value.ar}
            onChange={(event) => onChange({ ...value, ar: event.target.value })}
            maxLength={maxLength}
            rows={3}
            dir="rtl"
            lang="ar"
          />
        ) : (
          <Input
            id={`${id}-ar`}
            value={value.ar}
            onChange={(event) => onChange({ ...value, ar: event.target.value })}
            maxLength={maxLength}
            dir="rtl"
            lang="ar"
          />
        )}
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  titleKey,
  descriptionKey,
  children,
}: {
  icon: typeof Sparkles;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  children: ReactNode;
}): ReactElement {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-secondary" />
          {t(titleKey)}
        </CardTitle>
        <CardDescription>{t(descriptionKey)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function PageSkeleton(): ReactElement {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="skeleton h-56 rounded-card" />
      ))}
    </div>
  );
}

export function StorefrontPage(): ReactElement {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const content = useQuery({ queryKey: ['storefront'], queryFn: api.storefront.get });
  const [form, setForm] = useState<StorefrontContent | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (content.data) setForm(structuredClone(content.data));
  }, [content.data]);

  const save = useMutation({
    mutationFn: (data: StorefrontContent) => api.storefront.update(data),
    onSuccess: (data) => {
      setForm(structuredClone(data));
      queryClient.setQueryData(['storefront'], data);
      toast.success(t('storefront.toast.saved'), t('storefront.toast.savedMessage'));
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('storefront.toast.saveFailed'),
        t('storefront.toast.saveFailed'),
      ),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => api.uploads.image(await prepareImageUpload(file)),
    onSuccess: (uploaded) => {
      setForm((current) =>
        current ? { ...current, hero: { ...current.hero, imageUrl: uploaded.url } } : current,
      );
      toast.success(t('storefront.toast.uploaded'));
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('storefront.toast.uploadFailed'),
        t('storefront.toast.uploadFailed'),
      ),
  });

  if (content.isLoading && !content.data) return <PageSkeleton />;

  if (content.isError) {
    return (
      <ErrorState
        title={t('storefront.errors.load')}
        message={content.error instanceof Error ? content.error.message : undefined}
        onRetry={() => void content.refetch()}
      />
    );
  }

  if (!form || !content.data) return <PageSkeleton />;

  const dirty = JSON.stringify(form) !== JSON.stringify(content.data);

  const set = <K extends keyof StorefrontContent>(
    key: K,
    value: StorefrontContent[K],
  ): void => setForm((current) => (current ? { ...current, [key]: value } : current));

  const setHero = (patch: Partial<StorefrontContent['hero']>): void =>
    set('hero', { ...form.hero, ...patch });

  const onFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) upload.mutate(file);
  };

  const imagePreview = resolveImageUrl(form.hero.imageUrl);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(form);
      }}
    >
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {t('storefront.intro')}
              {dirty ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                  {t('storefront.unsaved')}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t('storefront.description')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForm(structuredClone(DEFAULT_STOREFRONT_CONTENT))}
              disabled={save.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              {t('storefront.reset')}
            </Button>
            <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
              <Save className="h-4 w-4" />
              {save.isPending ? t('actions.saving') : t('storefront.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <SectionCard
        icon={Sparkles}
        titleKey="storefront.hero.title"
        descriptionKey="storefront.hero.description"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
            {imagePreview ? (
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t('storefront.hero.upload')}
              </Button>
              {form.hero.imageUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setHero({ imageUrl: null })}
                >
                  <X className="h-4 w-4" />
                  {t('storefront.hero.remove')}
                </Button>
              ) : null}
            </div>
            <p className="max-w-md text-[11px] text-muted-foreground">
              {t('storefront.hero.imageHint')}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onFile}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="storefront-hero-url">{t('storefront.hero.imageUrl')}</Label>
          <Input
            id="storefront-hero-url"
            value={form.hero.imageUrl ?? ''}
            onChange={(event) => setHero({ imageUrl: event.target.value.trim() || null })}
            placeholder="https://…"
            maxLength={1000}
            dir="ltr"
          />
        </div>
        <LineField
          id="storefront-hero-alt"
          label={t('storefront.hero.imageAlt')}
          value={form.hero.imageAlt}
          onChange={(value) => setHero({ imageAlt: value })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <LineField
            id="storefront-hero-line1"
            label={t('storefront.hero.line1')}
            value={form.hero.line1}
            onChange={(value) => setHero({ line1: value })}
          />
          <LineField
            id="storefront-hero-line2"
            label={t('storefront.hero.line2')}
            value={form.hero.line2}
            onChange={(value) => setHero({ line2: value })}
          />
        </div>
        <LineField
          id="storefront-hero-accent"
          label={t('storefront.hero.accent')}
          value={form.hero.accent}
          onChange={(value) => setHero({ accent: value })}
        />
        <LineField
          id="storefront-hero-lead"
          label={t('storefront.hero.lead')}
          value={form.hero.lead}
          onChange={(value) => setHero({ lead: value })}
          multiline
          maxLength={BODY_MAX}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <LineField
            id="storefront-hero-search-placeholder"
            label={t('storefront.hero.searchPlaceholder')}
            value={form.hero.searchPlaceholder}
            onChange={(value) => setHero({ searchPlaceholder: value })}
          />
          <LineField
            id="storefront-hero-search-button"
            label={t('storefront.hero.searchButton')}
            value={form.hero.searchButton}
            onChange={(value) => setHero({ searchButton: value })}
            maxLength={CTA_MAX}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <LineField
            id="storefront-hero-primary"
            label={t('storefront.hero.primaryCta')}
            value={form.hero.primaryCta}
            onChange={(value) => setHero({ primaryCta: value })}
            maxLength={CTA_MAX}
          />
          <LineField
            id="storefront-hero-secondary"
            label={t('storefront.hero.secondaryCta')}
            value={form.hero.secondaryCta}
            onChange={(value) => setHero({ secondaryCta: value })}
            maxLength={CTA_MAX}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t('storefront.hero.bullets')}</p>
          {form.hero.bullets.map((bullet, index) => (
            <LineField
              key={index}
              id={`storefront-hero-bullet-${index}`}
              label={t('storefront.hero.bullet', { index: index + 1 })}
              value={bullet}
              onChange={(value) =>
                setHero({
                  bullets: form.hero.bullets.map((entry, at) => (at === index ? value : entry)),
                })
              }
              maxLength={CTA_MAX}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LineField
            id="storefront-hero-spotlight"
            label={t('storefront.hero.spotlightLabel')}
            value={form.hero.spotlightLabel}
            onChange={(value) => setHero({ spotlightLabel: value })}
            maxLength={CTA_MAX}
          />
          <LineField
            id="storefront-hero-delivery"
            label={t('storefront.hero.deliveryLabel')}
            value={form.hero.deliveryLabel}
            onChange={(value) => setHero({ deliveryLabel: value })}
            maxLength={CTA_MAX}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Sparkles}
        titleKey="storefront.sections.title"
        descriptionKey="storefront.sections.description"
      >
        {(
          [
            ['categories', 'storefront.sections.categories'],
            ['popular', 'storefront.sections.popular'],
            ['more', 'storefront.sections.more'],
          ] as const
        ).map(([key, labelKey]) => (
          <div key={key} className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">{t(labelKey)}</p>
            <LineField
              id={`storefront-heading-${key}-title`}
              label={t('storefront.sections.headingTitle')}
              value={form[key].title}
              onChange={(value) => set(key, { ...form[key], title: value })}
            />
            <LineField
              id={`storefront-heading-${key}-lead`}
              label={t('storefront.sections.headingLead')}
              value={form[key].lead}
              onChange={(value) => set(key, { ...form[key], lead: value })}
              multiline
              maxLength={BODY_MAX}
            />
          </div>
        ))}
      </SectionCard>

      <SectionCard
        icon={Sparkles}
        titleKey="storefront.how.title"
        descriptionKey="storefront.how.description"
      >
        <LineField
          id="storefront-how-title"
          label={t('storefront.sections.headingTitle')}
          value={form.how.title}
          onChange={(value) => set('how', { ...form.how, title: value })}
        />
        <LineField
          id="storefront-how-lead"
          label={t('storefront.sections.headingLead')}
          value={form.how.lead}
          onChange={(value) => set('how', { ...form.how, lead: value })}
          multiline
          maxLength={BODY_MAX}
        />
        {form.how.steps.map((step, index) => (
          <div key={index} className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">
              {t('storefront.how.step', { index: index + 1 })}
            </p>
            <LineField
              id={`storefront-how-step-${index}-title`}
              label={t('storefront.how.stepTitle')}
              value={step.title}
              onChange={(value) =>
                set('how', {
                  ...form.how,
                  steps: form.how.steps.map((entry, at) => (at === index ? { ...entry, title: value } : entry)),
                })
              }
              maxLength={CTA_MAX}
            />
            <LineField
              id={`storefront-how-step-${index}-body`}
              label={t('storefront.how.stepBody')}
              value={step.body}
              onChange={(value) =>
                set('how', {
                  ...form.how,
                  steps: form.how.steps.map((entry, at) => (at === index ? { ...entry, body: value } : entry)),
                })
              }
              multiline
              maxLength={BODY_MAX}
            />
          </div>
        ))}
      </SectionCard>

      <SectionCard
        icon={Bike}
        titleKey="storefront.fulfilment.title"
        descriptionKey="storefront.fulfilment.description"
      >
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Bike className="h-4 w-4 text-secondary" />
            {t('storefront.fulfilment.delivery')}
          </p>
          <LineField
            id="storefront-delivery-title"
            label={t('storefront.sections.headingTitle')}
            value={form.deliveryCard.title}
            onChange={(value) => set('deliveryCard', { ...form.deliveryCard, title: value })}
          />
          <LineField
            id="storefront-delivery-body"
            label={t('storefront.sections.headingLead')}
            value={form.deliveryCard.body}
            onChange={(value) => set('deliveryCard', { ...form.deliveryCard, body: value })}
            multiline
            maxLength={BODY_MAX}
          />
          <LineField
            id="storefront-delivery-fees"
            label={t('storefront.fulfilment.feesNote')}
            value={form.deliveryCard.feesNote}
            onChange={(value) => set('deliveryCard', { ...form.deliveryCard, feesNote: value })}
            multiline
            maxLength={BODY_MAX}
          />
        </div>
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Store className="h-4 w-4 text-secondary" />
            {t('storefront.fulfilment.pickup')}
          </p>
          <LineField
            id="storefront-pickup-title"
            label={t('storefront.sections.headingTitle')}
            value={form.pickupCard.title}
            onChange={(value) => set('pickupCard', { ...form.pickupCard, title: value })}
          />
          <LineField
            id="storefront-pickup-body"
            label={t('storefront.sections.headingLead')}
            value={form.pickupCard.body}
            onChange={(value) => set('pickupCard', { ...form.pickupCard, body: value })}
            multiline
            maxLength={BODY_MAX}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Sparkles}
        titleKey="storefront.closing.title"
        descriptionKey="storefront.closing.description"
      >
        <LineField
          id="storefront-closing-title"
          label={t('storefront.sections.headingTitle')}
          value={form.closing.title}
          onChange={(value) => set('closing', { ...form.closing, title: value })}
        />
        <LineField
          id="storefront-closing-body"
          label={t('storefront.sections.headingLead')}
          value={form.closing.body}
          onChange={(value) => set('closing', { ...form.closing, body: value })}
          multiline
          maxLength={BODY_MAX}
        />
        <LineField
          id="storefront-closing-cta"
          label={t('storefront.closing.cta')}
          value={form.closing.cta}
          onChange={(value) => set('closing', { ...form.closing, cta: value })}
          maxLength={CTA_MAX}
        />
      </SectionCard>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="text-xs text-muted-foreground">{t('storefront.footer')}</p>
          <Button type="submit" disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? t('actions.saving') : t('storefront.save')}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
