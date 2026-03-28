import { createFileRoute } from '@tanstack/react-router'
import FeatureBlocks from '../components/landing/FeatureBlocks'
import LandingCtaStrip from '../components/landing/LandingCtaStrip'
import LandingDeferredAuthCta from '../components/landing/LandingDeferredAuthCta'
import LandingHero from '../components/landing/LandingHero'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 pb-14 pt-14">
      <LandingHero />
      <div id="features">
        <FeatureBlocks />
      </div>
      <LandingCtaStrip />
      <LandingDeferredAuthCta />
    </main>
  )
}
