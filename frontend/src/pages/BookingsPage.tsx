import { Link } from "react-router";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { FadeIn } from "../components/ui/FadeIn";
import { Skeleton } from "../components/ui/Skeleton";
import { useAuth } from "../lib/auth-context";

export function BookingsPage() {
  const { session, ready } = useAuth();

  return (
    <FadeIn direction="up">
      <Card as="section" elevated className="panel">
        <h1>My bookings</h1>
        {!ready ? (
          <div aria-busy="true">
            <Skeleton width="100%" height="3rem" radius={10} />
          </div>
        ) : session ? (
          <EmptyState
            title="No tickets yet"
            description="Your reserved seats and tickets will appear here once you make your first booking (coming in week 12)."
            action={
              <Button as={Link} to="/" variant="solid" size="md">
                Browse movies
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Sign in to view bookings"
            description="You need to be logged in with your cinema account to view and manage your cinema tickets."
            action={
              <Button as={Link} to="/login" variant="solid" size="md">
                Log in
              </Button>
            }
          />
        )}
      </Card>
    </FadeIn>
  );
}
