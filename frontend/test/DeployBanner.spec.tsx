import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeployBanner, countdownLabel } from '../src/components/DeployBanner';

/**
 * The redeploy banner.
 *
 * It exists because the log was not enough: the first production deploy to
 * warn anyone reached two players and one missed it, because a log scrolls.
 * This sits outside the log, so it cannot be scrolled past, and it counts down
 * so a glance at any moment answers "how long have I got".
 */
const notice = (over: Partial<Parameters<typeof DeployBanner>[0]['notice']> = {}) => ({
  phase: 'imminent' as const,
  text: 'Fleet-wide systems shutdown in 45 seconds, Sir.',
  secondsLeft: 45 as number | null,
  dismiss: vi.fn(),
  ...over,
});

describe('DeployBanner', () => {
  it('renders nothing when there is no notice', () => {
    const { container } = render(<DeployBanner notice={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the server text, never copy of its own', () => {
    render(<DeployBanner notice={notice()} />);
    expect(screen.getByTestId('deploy-banner').textContent)
      .toContain('Fleet-wide systems shutdown in 45 seconds, Sir.');
  });

  it('formats the countdown as m:ss while it runs', () => {
    expect(countdownLabel(45)).toBe('0:45');
    expect(countdownLabel(9)).toBe('0:09');
    expect(countdownLabel(75)).toBe('1:15');
  });

  it('says "any moment now" at zero rather than 0:00', () => {
    // The stop can be late. A frozen 0:00 looks broken; this stays true.
    expect(countdownLabel(0)).toBe('any moment now');
  });

  it('shows a live timer for the imminent phase', () => {
    render(<DeployBanner notice={notice({ secondsLeft: 30 })} />);
    expect(screen.getByTestId('deploy-countdown').textContent).toBe('0:30');
  });

  it('shows NO timer when there is no honest number', () => {
    // `inbound` is a 5-10 minute range; CI cannot know when watchtower pulls.
    render(<DeployBanner notice={notice({ phase: 'inbound', secondsLeft: null })} />);
    expect(screen.queryByTestId('deploy-countdown')).not.toBeInTheDocument();
  });

  it('is an assertive live region, so it is announced rather than just drawn', () => {
    render(<DeployBanner notice={notice()} />);
    const banner = screen.getByTestId('deploy-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
  });

  it('reads more urgently for the imminent phase than the heads-up', () => {
    const { rerender } = render(<DeployBanner notice={notice({ phase: 'inbound', secondsLeft: null })} />);
    const calm = screen.getByTestId('deploy-banner').className;
    rerender(<DeployBanner notice={notice()} />);
    const urgent = screen.getByTestId('deploy-banner').className;
    expect(urgent).not.toEqual(calm);
  });

  it('can be dismissed', () => {
    const dismiss = vi.fn();
    render(<DeployBanner notice={notice({ dismiss })} />);
    return userEvent.click(screen.getByTestId('deploy-dismiss')).then(() => {
      expect(dismiss).toHaveBeenCalled();
    });
  });
});
