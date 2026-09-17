//go:build !windows

package openwechat

import "testing"

// winHandleCount is unavailable off Windows; callers skip the assertion.
//
// The probe's authoritative handle measurement is performed out of band
// in a quiescent process anyway, so skipping here loses no coverage.
func winHandleCount(t *testing.T) (uint32, bool) {
	t.Helper()
	return 0, false
}
