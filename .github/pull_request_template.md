## Summary

- 

## Type of Change

- [ ] Bug fix
- [ ] Feature
- [ ] UI polish
- [ ] Documentation
- [ ] Tests or tooling

## Public-Safety Checklist

- [ ] No private vault content, local paths, secrets, or personal workflow details are included.
- [ ] Screenshots and fixtures are synthetic or sanitized.
- [ ] Local config files are not committed.

## Validation

- [ ] `scripts/check-public-safety.sh`
- [ ] `node scripts/test-graph-runtime.mjs`
- [ ] `xcodebuild test -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO`
- [ ] `xcodebuild -project BrainBar.xcodeproj -scheme BrainBar -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build`

## Notes

- 
