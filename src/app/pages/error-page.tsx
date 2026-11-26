import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useRouteError } from 'react-router-dom'
import { ServerError } from '@/api/httpClient'
import { Button } from '@/app/components/ui/button'
import { ROUTES } from '@/routes/routesList'
import { useAppStore } from '@/store/app.store'

interface IError {
  status?: number
  statusText?: string
  internal?: boolean
  data?: string
}

export default function ErrorPage({ status, statusText }: IError) {
  const error = useRouteError() as IError

  return (
    <div className="w-full h-content flex flex-col justify-center items-center">
      <h1 className="scroll-m-20 text-4xl font-bold tracking-tight lg:text-5xl">
        Oops!
      </h1>

      <p className="leading-7 text-left mt-6">
        Status Code:{' '}
        <strong className="font-semibold">
          {(error?.status ?? status) || 'None'}
        </strong>
      </p>
      <p className="leading-7 mt-2 text-left">
        Description:{' '}
        <strong className="font-semibold">
          {(error?.data ?? statusText) || 'Unhandled Error'}
        </strong>
      </p>

      <Link to={ROUTES.LIBRARY.HOME}>
        <Button className="mt-6">Back to home</Button>
      </Link>
    </div>
  )
}

/**
 * A page's main request failed (see ServerError): the 404 page above when
 * the thing doesn't exist, otherwise the same look with a way out — Retry
 * for a server or network error, "Log in again" when the server rejects the
 * login.
 */
export function PageLoadError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const kind = error instanceof ServerError ? error.kind : 'server'

  if (kind === 'notFound') {
    return <ErrorPage status={404} statusText="Not Found" />
  }

  const k = 'clearplay.pageErrors'
  const auth = kind === 'auth'

  return (
    <div
      className="w-full h-content flex flex-col justify-center items-center"
      data-testid="page-error"
      data-kind={kind}
    >
      <h1 className="scroll-m-20 text-4xl font-bold tracking-tight lg:text-5xl text-center">
        {t(auth ? `${k}.authTitle` : `${k}.loadTitle`)}
      </h1>

      <p className="leading-7 mt-6 text-center">
        {t(auth ? `${k}.authText` : `${k}.loadText`)}
      </p>

      <div className="mt-6 flex gap-2">
        {auth ? (
          <Button
            onClick={() => {
              // Back to the server page with the address and username kept.
              useAppStore.setState((state) => {
                state.data.isServerConfigured = false
              })
              navigate(ROUTES.SERVER_CONFIG)
            }}
          >
            {t(`${k}.logInAgain`)}
          </Button>
        ) : (
          <Button onClick={onRetry}>{t(`${k}.retry`)}</Button>
        )}
        <Link to={ROUTES.LIBRARY.HOME}>
          <Button variant="outline">{t(`${k}.home`)}</Button>
        </Link>
      </div>
    </div>
  )
}
